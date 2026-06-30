import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Topbar } from '../../components/layout/Topbar'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { AppUser, AuditLogEntry } from '../../types'

interface Props { appUser: AppUser }

interface ToolTile {
  label: string
  to: string
  stat: string | number
  sub: string
  accent: string
  action?: string
}

const ACCENT_BG: Record<string, string> = {
  amber:  'border-t-amber-500',
  green:  'border-t-green-600',
  blue:   'border-t-blue-600',
  red:    'border-t-red-500',
  slate:  'border-t-slate-400',
  violet: 'border-t-violet-500',
}

export default function K12Dashboard({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id
  const navigate = useNavigate()

  const [stats, setStats] = useState({
    enrolled: 0,
    resultsPublished: 0,
    feeUnpaid: 0,
    auditCount: 0,
  })
  const [activity, setActivity] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) return
    async function load() {
      const [
        { count: enrolled },
        { count: published },
        { count: feeUnpaid },
        { count: auditCount },
        { data: recent },
      ] = await Promise.all([
        supabase.from('learner_enrollments').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('status', 'active'),
        supabase.from('term_results').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('status', 'published'),
        supabase.from('fee_invoices').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).in('status', ['unpaid', 'partial']),
        supabase.from('audit_log').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId),
        supabase.from('audit_log').select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      setStats({
        enrolled: enrolled ?? 0,
        resultsPublished: published ?? 0,
        feeUnpaid: feeUnpaid ?? 0,
        auditCount: auditCount ?? 0,
      })
      setActivity((recent ?? []) as AuditLogEntry[])
      setLoading(false)
    }
    load()
  }, [schoolId])

  const tools: ToolTile[] = [
    {
      label: 'Enrollment',
      to: '/k12/enrollment',
      stat: loading ? '—' : stats.enrolled,
      sub: 'active learners',
      accent: 'amber',
      action: '+ Enroll',
    },
    {
      label: 'Results',
      to: '/k12/results',
      stat: loading ? '—' : stats.resultsPublished,
      sub: 'results published',
      accent: 'green',
      action: 'Manage',
    },
    {
      label: 'Fee Management',
      to: '/k12/fee-management',
      stat: loading ? '—' : stats.feeUnpaid,
      sub: 'unpaid / partial invoices',
      accent: 'blue',
      action: 'Collect',
    },
    {
      label: 'Transfers',
      to: '/k12/transfers',
      stat: '—',
      sub: 'pending transfers',
      accent: 'violet',
      action: 'Review',
    },
    {
      label: 'Promotion',
      to: '/k12/promotion',
      stat: '—',
      sub: 'learners eligible',
      accent: 'slate',
      action: 'Run',
    },
    {
      label: 'Audit Log',
      to: '/k12/audit',
      stat: loading ? '—' : stats.auditCount,
      sub: 'total events',
      accent: 'red',
      action: 'View',
    },
  ]

  const schoolName = appUser.activeSchool?.name ?? 'School'
  const stages = appUser.activeSchool?.stages_offered?.map(s => s.toUpperCase()).join(' · ') ?? ''

  return (
    <>
      <Topbar
        title={schoolName}
        meta={stages}
      />

      <div className="p-8 space-y-8">
        {/* Identity strip */}
        <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="text-[22px] font-bold text-navy-900 leading-tight">{schoolName}</div>
            <div className="text-sm text-gray-400 mt-0.5">
              {appUser.activeMembership?.office?.name?.replace(/_/g, ' ')} · K–12 School Management
            </div>
          </div>
        </div>

        {/* Tool grid */}
        <section>
          <div className="label mb-4">Modules</div>
          <div className="grid grid-cols-3 gap-4">
            {tools.map(t => (
              <button
                key={t.to}
                onClick={() => navigate(t.to)}
                className={cn(
                  'bg-white border border-gray-200 rounded-sm p-5 text-left',
                  'border-t-2 hover:shadow-sm transition-shadow cursor-pointer group',
                  ACCENT_BG[t.accent]
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="label text-[10px] tracking-[0.1em]">{t.label}</div>
                  <span className="text-[11px] text-navy-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    {t.action} →
                  </span>
                </div>
                <div className="text-[32px] font-bold text-navy-900 leading-none mb-2">{t.stat}</div>
                <div className="text-xs text-gray-500">{t.sub}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Activity feed */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="label">Recent Activity</div>
            <Link to="/k12/audit" className="text-xs font-semibold text-navy-700 hover:underline">
              Full log →
            </Link>
          </div>
          <Card>
            {loading ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">Loading…</div>
            ) : activity.length === 0 ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">No activity yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {activity.map(ev => (
                  <div key={ev.id} className="px-5 py-3 flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-navy-400 flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-navy-900">{ev.action_type}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] font-semibold text-navy-600 uppercase tracking-wide">
                        {ev.actor_office.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(ev.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </>
  )
}
