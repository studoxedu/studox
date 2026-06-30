import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { ResultStatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { flowExecute, supabase } from '../../lib/supabase'
import { notify } from '../../lib/notifications'
import type { AppUser, CourseOffering } from '../../types'

interface Props { appUser: AppUser }

const PIPELINE: { status: string; next: string; action: string; label: string }[] = [
  { status: 'draft',     next: 'submitted', action: 'results.submit',  label: 'Submit' },
  { status: 'submitted', next: 'verified',  action: 'results.verify',  label: 'Verify' },
  { status: 'verified',  next: 'approved',  action: 'results.approve', label: 'Approve' },
  { status: 'approved',  next: 'published', action: 'results.publish', label: 'Publish' },
]

export default function TertiaryResultsPipeline({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const officeName = appUser.activeMembership?.office?.name ?? ''
  const [offerings, setOfferings] = useState<CourseOffering[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('course_offerings')
      .select('*, course:courses(code, title, credit_units), semester:semesters(label, session:academic_sessions(label))')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setOfferings((data ?? []) as CourseOffering[]))
  }, [schoolId])

  async function advance(offering: CourseOffering) {
    const step = PIPELINE.find(p => p.status === offering.results_status)
    if (!step) return
    setLoading(offering.id)
    try {
      await flowExecute(step.action, schoolId, { offering_id: offering.id })
      setOfferings(prev => prev.map(o => o.id === offering.id ? { ...o, results_status: step.next as import('../../types').ResultStatus } : o))
      notify(appUser.profile.id, schoolId, `Results ${step.next}`, {
        body: `${(offering as any).course?.code} results advanced to ${step.next}`,
        type: step.next === 'published' ? 'success' : 'info',
        link: '/tertiary/results',
      })
      showToast(`Results ${step.next} for ${(offering as any).course?.code}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(null)
    }
  }

  function canAdvance(offering: CourseOffering) {
    const step = PIPELINE.find(p => p.status === offering.results_status)
    if (!step) return false
    const caps: Record<string, string[]> = {
      lecturer:     ['results.submit'],
      exam_officer: ['results.verify'],
      hod:          ['results.approve'],
      dean:         ['results.approve', 'results.publish'],
      school_admin: ['results.approve', 'results.publish'],
    }
    return (caps[officeName] ?? []).includes(step.action)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const grouped = PIPELINE.map(p => ({
    status: p.status,
    action: p.action,
    offerings: offerings.filter(o => o.results_status === p.status),
  }))
  const published = offerings.filter(o => o.results_status === 'published')

  return (
    <>
      <Topbar title="Results Pipeline" meta="5-step governance chain" />

      <div className="p-8 space-y-4">
        {grouped.map(({ status, offerings: group }) => (
          <Card key={status}>
            <CardHeader
              title={`${status.charAt(0).toUpperCase() + status.slice(1)}`}
              meta={`${group.length} offering${group.length !== 1 ? 's' : ''}`}
            />
            {group.length === 0 ? (
              <div className="px-5 py-4 text-sm text-gray-400">No offerings at this stage.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Course', 'Semester', 'Status', 'Action'].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <div className="text-sm font-semibold text-navy-900">{(o as any).course?.code} — {(o as any).course?.title}</div>
                        <div className="text-xs text-gray-400">{(o as any).course?.credit_units} credit units</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {(o as any).semester?.label} · {(o as any).semester?.session?.label}
                      </td>
                      <td className="px-5 py-3">
                        <ResultStatusBadge status={o.results_status as import('../../types').ResultStatus} />
                      </td>
                      <td className="px-5 py-3">
                        {canAdvance(o) ? (
                          <Button
                            variant="amber"
                            size="sm"
                            onClick={() => advance(o)}
                            disabled={loading === o.id}
                          >
                            {loading === o.id ? '…' : `→ ${PIPELINE.find(p => p.status === o.results_status)?.label}`}
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400">Awaiting your role</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}

        {published.length > 0 && (
          <Card>
            <CardHeader title="Published" meta={`${published.length} offering${published.length !== 1 ? 's' : ''}`} />
            <div className="divide-y divide-gray-50">
              {published.map(o => (
                <div key={o.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-navy-900">{(o as any).course?.code}</span>
                    <span className="text-sm text-gray-500 ml-2">{(o as any).course?.title}</span>
                  </div>
                  <ResultStatusBadge status="published" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">{toast}</div>
      )}
    </>
  )
}
