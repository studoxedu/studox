import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader, StatCard } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input, Select, Grid2 } from '../../components/ui/Form'
import { flowExecute, supabase } from '../../lib/supabase'
import { formatNaira, formatDate } from '../../lib/utils'
import type { AppUser, FeeRecord, LearnerEnrollment } from '../../types'

interface Props { appUser: AppUser }

export default function K12Fees({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [records, setRecords] = useState<FeeRecord[]>([])
  const [enrollments, setEnrollments] = useState<LearnerEnrollment[]>([])
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, count: 0 })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({
    enrollment_id: '',
    amount: '',
    description: '',
    academic_session: '2024/2025',
    term: '3',
  })

  useEffect(() => {
    if (!schoolId) return
    Promise.all([
      supabase.from('fee_records').select('*, enrollment:learner_enrollments(*, learner:learners(*))').eq('school_id', schoolId).order('recorded_at', { ascending: false }).limit(50),
      supabase.from('learner_enrollments').select('*, learner:learners(*)').eq('school_id', schoolId).eq('status', 'active').order('created_at'),
    ]).then(([{ data: fees }, { data: en }]) => {
      const f = (fees ?? []) as FeeRecord[]
      setRecords(f)
      setEnrollments((en ?? []) as LearnerEnrollment[])
      const now = new Date()
      const thisMonth = f.filter(r => {
        const d = new Date(r.recorded_at)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      setStats({
        total: f.reduce((s, r) => s + Number(r.amount), 0),
        thisMonth: thisMonth.reduce((s, r) => s + Number(r.amount), 0),
        count: f.length,
      })
    })
  }, [schoolId])

  async function recordFee() {
    setLoading(true)
    try {
      await flowExecute('fee.record', schoolId, {
        enrollment_id: form.enrollment_id,
        amount: parseFloat(form.amount),
        description: form.description,
        academic_session: form.academic_session,
        term: parseInt(form.term),
      })
      showToast('Fee recorded successfully.')
      setOpen(false)
      setForm({ enrollment_id: '', amount: '', description: '', academic_session: '2024/2025', term: '3' })
      // Reload
      const { data } = await supabase.from('fee_records').select('*, enrollment:learner_enrollments(*, learner:learners(*))').eq('school_id', schoolId).order('recorded_at', { ascending: false }).limit(50)
      setRecords((data ?? []) as FeeRecord[])
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000) }

  return (
    <>
      <Topbar
        title="Fee Records"
        meta="Payment history"
        actions={<Button variant="amber" size="sm" onClick={() => setOpen(true)}>+ Record Payment</Button>}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Collected" value={formatNaira(stats.total)} sub="All time" accent="amber" />
          <StatCard label="This Month" value={formatNaira(stats.thisMonth)} sub="Current month" accent="green" />
          <StatCard label="Transactions" value={stats.count} sub="Payment records" accent="blue" />
        </div>

        <Card>
          <CardHeader title="Payment History" meta="Most recent first" />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Receipt Ref', 'Learner', 'Amount', 'Description', 'Session / Term', 'Date'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs text-navy-900 font-semibold">{r.receipt_ref}</td>
                  <td className="px-5 py-3 text-sm text-navy-900">
                    {(r as any).enrollment?.learner?.first_name} {(r as any).enrollment?.learner?.last_name}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-green-700">{formatNaira(Number(r.amount))}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{r.description || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{r.academic_session} · T{r.term}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(r.recorded_at)}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-sm text-gray-400 text-center">No fee records yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={open}
        title="Record Fee Payment"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="amber" onClick={recordFee} disabled={loading || !form.enrollment_id || !form.amount}>
              {loading ? 'Recording…' : 'Record Payment'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Learner" required>
            <Select value={form.enrollment_id} onChange={e => setForm(f => ({ ...f, enrollment_id: e.target.value }))}>
              <option value="">Select learner…</option>
              {enrollments.map(en => (
                <option key={en.id} value={en.id}>
                  {en.learner?.first_name} {en.learner?.last_name} ({en.learner?.learner_id})
                </option>
              ))}
            </Select>
          </Field>
          <Grid2>
            <Field label="Amount (₦)" required>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" min="0" />
            </Field>
            <Field label="Term">
              <Select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </Select>
            </Field>
          </Grid2>
          <Field label="Description">
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. School fees, Development levy…" />
          </Field>
          <Field label="Academic Session">
            <Input value={form.academic_session} onChange={e => setForm(f => ({ ...f, academic_session: e.target.value }))} placeholder="2024/2025" />
          </Field>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">{toast}</div>
      )}
    </>
  )
}
