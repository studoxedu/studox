import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/utils'
import type { AppUser, AuditLogEntry } from '../../types'

interface Props { appUser: AppUser }

export default function ProprietorAudit({ appUser: _ }: Props) {
  const [events, setEvents] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('*, school:schools(name)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setEvents((data ?? []) as AuditLogEntry[])
        setLoading(false)
      })
  }, [])

  return (
    <>
      <Topbar title="Group Audit Activity" meta="Immutable event log across all institutions" />

      <div className="p-8">
        <div className="bg-navy-50 border border-navy-200 rounded-sm px-5 py-3 mb-6 text-xs text-navy-700">
          All entries are append-only and cannot be modified or deleted. This is your institution group's complete governance trail.
        </div>

        <Card>
          <CardHeader title="All Events" meta={`${events.length} entries shown`} />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Ref', 'School', 'Action', 'Office', 'Timestamp'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-sm text-gray-400 text-center">No audit events yet.</td></tr>
              ) : events.map(ev => (
                <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{ev.audit_ref}</td>
                  <td className="px-5 py-3 text-sm text-navy-900">{(ev as any).school?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs bg-navy-50 text-navy-700 px-2 py-0.5 rounded-sm">{ev.action_type}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{ev.actor_office.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{formatDateTime(ev.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
