import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/utils'
import type { AppUser, AuditLogEntry } from '../../types'

interface Props { appUser: AppUser }

const ACTION_DOT_COLORS: Record<string, string> = {
  'learner.enroll':            'bg-blue-500',
  'results.finalize':          'bg-green-500',
  'results.reopen':            'bg-yellow-500',
  'fee.record':                'bg-amber-500',
  'learner.promote':           'bg-purple-500',
  'learner.transfer.initiate': 'bg-orange-500',
}

export default function AuditLog({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('audit_log')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setEntries((data ?? []) as AuditLogEntry[])
        setLoading(false)
      })
  }, [schoolId])

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.audit_ref.includes(search) || e.action_type.includes(search)
    const matchAction = !actionFilter || e.action_type === actionFilter
    return matchSearch && matchAction
  })

  const actionTypes = Array.from(new Set(entries.map(e => e.action_type)))

  return (
    <>
      <Topbar
        title="Audit Log"
        meta="Immutable record of all flow_execute actions"
      />

      <div className="p-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by audit ref or action…"
            className="input-field flex-1 max-w-xs"
          />
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="input-field w-48"
          >
            <option value="">All action types</option>
            {actionTypes.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <Card>
          {/* Immutability notice */}
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-2.5 flex items-center gap-2 text-xs text-gray-500">

            This log is append-only. No entry can be edited or deleted — every row was written atomically by flow_execute inside a single transaction.
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Audit Ref', 'Timestamp', 'Action', 'Actor Office', 'Status'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-sm text-gray-400 text-center">Loading…</td></tr>
              ) : filtered.map(entry => (
                <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-gray-400">{entry.audit_ref}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACTION_DOT_COLORS[entry.action_type] ?? 'bg-gray-400'}`} />
                      <span className="text-sm font-semibold text-navy-900">{entry.action_type}</span>
                    </div>
                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5 ml-4">
                        {Object.entries(entry.payload)
                          .filter(([k]) => !k.includes('_id'))
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      label={entry.actor_office.replace(/_/g, ' ')}
                      bg="bg-navy-100"
                      text="text-navy-700"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      label="Committed"
                      bg="bg-green-50"
                      text="text-green-700"
                      className="border border-green-200"
                    />
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-sm text-gray-400 text-center">No audit entries found.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
