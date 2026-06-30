import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input } from '../../components/ui/Form'
import { EnrollmentStatusBadge } from '../../components/ui/Badge'
import { flowExecute, supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import type { AppUser, LearnerEnrollment } from '../../types'

interface Props { appUser: AppUser }

export default function K12Transfers({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [enrollments, setEnrollments] = useState<LearnerEnrollment[]>([])
  const [selected, setSelected] = useState<LearnerEnrollment | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [destSchool, setDestSchool] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('learner_enrollments')
      .select('*, learner:learners(*)')
      .eq('school_id', schoolId)
      .in('status', ['active', 'transferred'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setEnrollments((data ?? []) as LearnerEnrollment[]))
  }, [schoolId])

  async function initiateTransfer() {
    if (!selected) return
    setLoading(true)
    setConfirmOpen(false)
    try {
      await flowExecute('learner.transfer.initiate', schoolId, {
        enrollment_id: selected.id,
        destination_school_id: destSchool || null,
        reason,
      })
      showToast(`Transfer initiated for ${selected.learner?.first_name} ${selected.learner?.last_name}. Audit entry created.`)
      setSelected(null)
      setDestSchool('')
      setReason('')
      const { data } = await supabase.from('learner_enrollments').select('*, learner:learners(*)').eq('school_id', schoolId).in('status', ['active', 'transferred']).order('created_at', { ascending: false })
      setEnrollments((data ?? []) as LearnerEnrollment[])
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const active = enrollments.filter(e => e.status === 'active')
  const transferred = enrollments.filter(e => e.status === 'transferred')

  return (
    <>
      <Topbar title="Transfers" meta="Learner transfer management" />

      <div className="p-8 space-y-6">
        <Card>
          <CardHeader
            title="Active Learners"
            meta={`${active.length} eligible for transfer`}
          />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Learner', 'Learner ID', 'Stage', 'Enrolled', 'Action'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map(en => (
                <tr key={en.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-sm font-semibold text-navy-900">
                    {en.learner?.first_name} {en.learner?.last_name}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{en.learner?.learner_id}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 uppercase">{en.stage}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(en.entry_date)}</td>
                  <td className="px-5 py-3">
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(en); setConfirmOpen(true) }}>
                      Initiate Transfer
                    </Button>
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-sm text-gray-400 text-center">No active learners.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {transferred.length > 0 && (
          <Card>
            <CardHeader title="Transferred Learners" meta="Out-transfers from this school" />
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Learner', 'Learner ID', 'Stage', 'Exit Date', 'Status'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transferred.map(en => (
                  <tr key={en.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-5 py-3 text-sm font-semibold text-navy-900">{en.learner?.first_name} {en.learner?.last_name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{en.learner?.learner_id}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 uppercase">{en.stage}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{en.exit_date ? formatDate(en.exit_date) : '—'}</td>
                    <td className="px-5 py-3"><EnrollmentStatusBadge status={en.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal
        open={confirmOpen && !loading}
        title="Initiate Transfer"
        onClose={() => { setConfirmOpen(false); setSelected(null) }}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirmOpen(false); setSelected(null) }}>Cancel</Button>
            <Button variant="danger" onClick={initiateTransfer} disabled={loading}>
              Confirm Transfer
            </Button>
          </>
        }
      >
        <div className="text-sm text-gray-600 mb-4">
          Transfer <strong>{selected?.learner?.first_name} {selected?.learner?.last_name}</strong> ({selected?.learner?.learner_id}) out of this school. This is logged and sets enrollment status to <em>transferred</em>.
        </div>
        <div className="space-y-4">
          <Field label="Destination School (optional)">
            <Input value={destSchool} onChange={e => setDestSchool(e.target.value)} placeholder="Destination school name or ID" />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Relocation, parental request, etc." />
          </Field>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">{toast}</div>
      )}
    </>
  )
}
