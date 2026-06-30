import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface Payment {
  id: string
  amount: number
  receipt_ref: string | null
  payment_method: string | null
  recorded_at: string
  invoice?: { description: string | null }
}

export default function StudentTransactions({ appUser }: Props) {
  const ctx = useStudentContext(appUser)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!ctx.studentId) return
    supabase.from('fee_invoices').select('id, description')
      .eq('student_id', ctx.studentId)
      .then(async ({ data: invs }) => {
        const ids = (invs ?? []).map(i => i.id)
        if (ids.length === 0) { setLoading(false); return }
        const { data: pmts } = await supabase.from('fee_payments')
          .select('id, amount, receipt_ref, payment_method, recorded_at, invoice:fee_invoices(description)')
          .in('invoice_id', ids)
          .order('recorded_at', { ascending: false })
        setPayments((pmts ?? []) as unknown as Payment[])
        setLoading(false)
      })
  }, [ctx.studentId])

  const total = payments.reduce((s, p) => s + p.amount, 0)

  if (ctx.loading || loading) return <div className="p-8 text-sm text-gray-400">Loading transactions…</div>

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-xl font-bold text-navy-900">Transactions</div>
        <div className="text-sm text-gray-400 mt-0.5">All payment receipts</div>
      </div>

      {payments.length > 0 && (
        <Card className="p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Payments</div>
          <div className="text-3xl font-bold text-green-600">₦{total.toLocaleString()}</div>
        </Card>
      )}

      <Card>
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-navy-900">Payment History</div>
        </div>
        {payments.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">No payments recorded yet.</div>
        ) : (
          payments.map(p => (
            <div key={p.id} className="px-5 py-4 border-b border-gray-50 last:border-0 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-navy-900">
                  {(p.invoice as any)?.description ?? 'Payment'}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{new Date(p.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {p.payment_method && <span className="capitalize">· {p.payment_method}</span>}
                  {p.receipt_ref && <span className="font-mono text-gray-300">· {p.receipt_ref}</span>}
                </div>
              </div>
              <div className="text-sm font-bold text-green-600">₦{p.amount.toLocaleString()}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
