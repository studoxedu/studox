import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface PayrollRun {
  id: string
  school_id: string
  month: string
  status: 'draft' | 'approved' | 'paid'
  created_at: string
}

interface PayrollEntry {
  id: string
  run_id: string
  membership_id: string
  basic_pay: number
  total_allowances: number
  total_deductions: number
  profile?: { first_name: string | null; last_name: string | null; email: string }
  office?: { name: string }
  salary_grade?: { name: string }
}

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  paid:     'bg-green-100 text-green-700',
}

function fmt(n: number) { return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` }

export default function Payroll({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const membershipId = appUser.activeMembership?.id ?? ''

  const [tab, setTab]             = useState<'runs' | 'grades'>('runs')
  const [runs, setRuns]           = useState<PayrollRun[]>([])
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null)
  const [entries, setEntries]     = useState<PayrollEntry[]>([])
  const [adjustments, setAdjustments] = useState<Record<string, { allowances: string; deductions: string }>>({})
  const [grades, setGrades]       = useState<{ id: string; name: string; basic_pay: number }[]>([])
  const [loading, setLoading]     = useState(true)
  const [running, setRunning]     = useState(false)
  const [savingAdj, setSavingAdj] = useState<string | null>(null)
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // New run
  const [newMonth, setNewMonth]   = useState(new Date().toISOString().slice(0, 7))

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function loadRuns() {
    const [{ data: rs }, { data: gs }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('school_id', schoolId).order('month', { ascending: false }),
      supabase.from('salary_grades').select('*').eq('school_id', schoolId).order('basic_pay'),
    ])
    setRuns((rs ?? []) as PayrollRun[])
    setGrades((gs ?? []) as any[])
    setLoading(false)
  }

  async function loadEntries(run: PayrollRun) {
    setSelectedRun(run)
    const { data } = await supabase
      .from('payroll_entries')
      .select(`
        *,
        membership:memberships(
          office:offices(name),
          profile:profiles(first_name, last_name, email),
          staff_profile:staff_profiles(salary_grade:salary_grades(name))
        )
      `)
      .eq('run_id', run.id)

    const enriched = ((data ?? []) as any[]).map(e => ({
      ...e,
      profile: e.membership?.profile,
      office:  e.membership?.office,
      salary_grade: e.membership?.staff_profile?.salary_grade,
    }))
    setEntries(enriched)

    const init: Record<string, { allowances: string; deductions: string }> = {}
    enriched.forEach(e => {
      init[e.id] = {
        allowances: e.total_allowances?.toString() ?? '0',
        deductions: e.total_deductions?.toString() ?? '0',
      }
    })
    setAdjustments(init)
  }

  useEffect(() => { if (schoolId) loadRuns() }, [schoolId])

  async function runPayroll() {
    if (!newMonth) return
    setRunning(true)

    // Create run
    const { data: run, error: runErr } = await supabase
      .from('payroll_runs')
      .insert({ school_id: schoolId, month: newMonth, status: 'draft', created_by: membershipId })
      .select().single()

    if (runErr) {
      flash(runErr.message.includes('unique') ? `Payroll for ${newMonth} already exists.` : runErr.message, 'error')
      setRunning(false)
      return
    }

    // Load all staff profiles with salary grades for this school
    const { data: profs } = await supabase
      .from('staff_profiles')
      .select('membership_id, salary_grade:salary_grades(basic_pay)')
      .eq('school_id', schoolId)
      .not('salary_grade_id', 'is', null)

    const entries = ((profs ?? []) as any[]).map(p => ({
      run_id:           run.id,
      membership_id:    p.membership_id,
      basic_pay:        p.salary_grade?.basic_pay ?? 0,
      total_allowances: 0,
      total_deductions: 0,
    }))

    if (entries.length > 0) {
      await supabase.from('payroll_entries').insert(entries)
    }

    setRunning(false)
    flash(`Payroll run for ${newMonth} created with ${entries.length} staff entries.`)
    loadRuns()
    loadEntries(run as PayrollRun)
  }

  async function saveAdjustment(entryId: string) {
    setSavingAdj(entryId)
    const adj = adjustments[entryId]
    await supabase.from('payroll_entries').update({
      total_allowances: parseFloat(adj.allowances) || 0,
      total_deductions: parseFloat(adj.deductions) || 0,
    }).eq('id', entryId)
    setSavingAdj(null)
    flash('Saved.')
    if (selectedRun) loadEntries(selectedRun)
  }

  async function advanceRun(status: 'approved' | 'paid') {
    if (!selectedRun) return
    await supabase.from('payroll_runs').update({ status }).eq('id', selectedRun.id)
    flash(`Payroll ${status}.`)
    loadRuns()
    setSelectedRun(prev => prev ? { ...prev, status } : null)
  }

  function printPayslip(entry: PayrollEntry, run: PayrollRun) {
    const name = [entry.profile?.first_name, entry.profile?.last_name].filter(Boolean).join(' ') || entry.profile?.email || 'Staff'
    const net = entry.basic_pay + entry.total_allowances - entry.total_deductions
    const win = window.open('', '_blank', 'width=420,height=560')
    if (!win) return
    win.document.write(`
      <html><head><title>Payslip — ${run.month}</title>
      <style>body{font-family:sans-serif;padding:32px;font-size:13px;color:#111}
      table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #eee}
      .r{text-align:right}.bold{font-weight:bold}.total{font-size:16px;font-weight:bold}
      </style></head><body>
      <div style="font-size:18px;font-weight:bold">${appUser.activeSchool?.name ?? 'School'}</div>
      <div style="color:#666;margin-bottom:20px">Pay Slip — ${run.month}</div>
      <div style="margin-bottom:16px">
        <div><b>Name:</b> ${name}</div>
        <div><b>Role:</b> ${entry.office?.name?.replace('_',' ') ?? ''}</div>
        ${entry.salary_grade ? `<div><b>Grade:</b> ${entry.salary_grade.name}</div>` : ''}
      </div>
      <table>
        <tr><td>Basic Pay</td><td class="r">${fmt(entry.basic_pay)}</td></tr>
        <tr><td>Total Allowances</td><td class="r">+ ${fmt(entry.total_allowances)}</td></tr>
        <tr><td>Total Deductions</td><td class="r">− ${fmt(entry.total_deductions)}</td></tr>
        <tr><td class="bold total">NET PAY</td><td class="r bold total">${fmt(net)}</td></tr>
      </table>
      <div style="margin-top:24px;font-size:11px;color:#999">Status: ${run.status.toUpperCase()} · Generated ${new Date().toLocaleDateString()}</div>
      <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `)
    win.document.close()
  }

  const totalNet = entries.reduce((s, e) => {
    const adj = adjustments[e.id]
    const all = parseFloat(adj?.allowances ?? e.total_allowances?.toString()) || 0
    const ded = parseFloat(adj?.deductions ?? e.total_deductions?.toString()) || 0
    return s + e.basic_pay + all - ded
  }, 0)

  return (
    <>
      <Topbar title="Payroll" meta={appUser.activeSchool?.name} />

      <div className="p-8 space-y-6">
        {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['runs', 'grades'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                tab === t ? 'border-navy-900 text-navy-900' : 'border-transparent text-gray-400 hover:text-navy-700')}>
              {t === 'runs' ? 'Payroll Runs' : 'Salary Grades'}
            </button>
          ))}
        </div>

        {/* ── GRADES TAB ── */}
        {tab === 'grades' && (
          <Card>
            <CardHeader title="Salary Grades" meta="Used to auto-populate basic pay in payroll runs" />
            {grades.length === 0 ? (
              <div className="px-5 py-8 text-sm text-gray-400 text-center">
                No salary grades. Add them from Staff Management (+ Salary Grade button).
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Grade Name', 'Basic Pay / Month'].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grades.map(g => (
                    <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                      <td className="px-5 py-3 text-sm font-semibold text-navy-900">{g.name}</td>
                      <td className="px-5 py-3 text-sm font-mono text-navy-900">{fmt(g.basic_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {/* ── RUNS TAB ── */}
        {tab === 'runs' && (
          <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
            {/* Left: run list + create */}
            <div className="space-y-4">
              <Card className="p-5">
                <div className="text-sm font-bold text-navy-900 mb-3">New Payroll Run</div>
                <Field label="Month">
                  <Input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)} />
                </Field>
                <Button variant="primary" size="sm" className="mt-3 w-full" onClick={runPayroll} disabled={running}>
                  {running ? 'Generating…' : 'Generate Payroll'}
                </Button>
                <p className="text-xs text-gray-400 mt-2">
                  Creates entries for all staff with salary grades assigned.
                </p>
              </Card>

              <Card>
                <CardHeader title="Previous Runs" />
                {loading ? (
                  <div className="px-5 py-6 text-sm text-gray-400">Loading…</div>
                ) : runs.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-gray-400">No runs yet.</div>
                ) : runs.map(r => (
                  <button
                    key={r.id}
                    onClick={() => loadEntries(r)}
                    className={cn(
                      'w-full text-left px-5 py-3 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors',
                      selectedRun?.id === r.id && 'bg-navy-50'
                    )}
                  >
                    <span className="text-sm font-semibold text-navy-900">{r.month}</span>
                    <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm', STATUS_COLOR[r.status])}>
                      {r.status}
                    </span>
                  </button>
                ))}
              </Card>
            </div>

            {/* Right: entries */}
            {selectedRun ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-navy-900">{selectedRun.month}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {entries.length} staff · Total net: {fmt(totalNet)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedRun.status === 'draft' && (
                      <Button variant="secondary" size="sm" onClick={() => advanceRun('approved')}>Approve</Button>
                    )}
                    {selectedRun.status === 'approved' && (
                      <Button variant="primary" size="sm" onClick={() => advanceRun('paid')}>Mark Paid</Button>
                    )}
                    <span className={cn('inline-flex items-center px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide', STATUS_COLOR[selectedRun.status])}>
                      {selectedRun.status}
                    </span>
                  </div>
                </div>

                <Card>
                  {entries.length === 0 ? (
                    <div className="px-5 py-8 text-sm text-gray-400 text-center">
                      No entries. Staff must have salary grades assigned in Staff Management.
                    </div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {['Staff', 'Grade', 'Basic', 'Allowances', 'Deductions', 'Net', ''].map(h => (
                            <th key={h} className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(e => {
                          const adj = adjustments[e.id] ?? { allowances: '0', deductions: '0' }
                          const all = parseFloat(adj.allowances) || 0
                          const ded = parseFloat(adj.deductions) || 0
                          const net = e.basic_pay + all - ded
                          const name = [e.profile?.first_name, e.profile?.last_name].filter(Boolean).join(' ') || e.profile?.email || '—'
                          const isDraft = selectedRun.status === 'draft'

                          return (
                            <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                              <td className="px-3 py-3">
                                <div className="text-sm font-semibold text-navy-900">{name}</div>
                                <div className="text-[10px] text-gray-400 capitalize">{e.office?.name?.replace('_', ' ')}</div>
                              </td>
                              <td className="px-3 py-3 text-xs text-gray-600">{e.salary_grade?.name ?? '—'}</td>
                              <td className="px-3 py-3 text-sm font-mono">{fmt(e.basic_pay)}</td>
                              <td className="px-3 py-2">
                                {isDraft ? (
                                  <input type="number" min="0"
                                    value={adj.allowances}
                                    onChange={ev => setAdjustments(a => ({ ...a, [e.id]: { ...a[e.id], allowances: ev.target.value } }))}
                                    className="w-24 border border-gray-200 rounded-sm px-2 py-1 text-sm font-mono outline-none focus:border-navy-500"
                                  />
                                ) : <span className="text-sm font-mono">{fmt(e.total_allowances)}</span>}
                              </td>
                              <td className="px-3 py-2">
                                {isDraft ? (
                                  <input type="number" min="0"
                                    value={adj.deductions}
                                    onChange={ev => setAdjustments(a => ({ ...a, [e.id]: { ...a[e.id], deductions: ev.target.value } }))}
                                    className="w-24 border border-gray-200 rounded-sm px-2 py-1 text-sm font-mono outline-none focus:border-navy-500"
                                  />
                                ) : <span className="text-sm font-mono">{fmt(e.total_deductions)}</span>}
                              </td>
                              <td className="px-3 py-3 text-sm font-bold font-mono text-navy-900">{fmt(net)}</td>
                              <td className="px-3 py-3">
                                <div className="flex gap-1">
                                  {isDraft && (
                                    <Button variant="ghost" size="sm"
                                      onClick={() => saveAdjustment(e.id)}
                                      disabled={savingAdj === e.id}>
                                      {savingAdj === e.id ? '…' : 'Save'}
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" onClick={() => printPayslip(e, selectedRun)}>
                                    Payslip
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>
            ) : (
              <Card className="py-16 text-center">
                <div className="text-sm text-gray-400">Select a payroll run to view entries.</div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  )
}
