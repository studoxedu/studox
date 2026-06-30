import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { supabase, flowExecute } from '../../lib/supabase'
import type { AppUser, Stage } from '../../types'

const STAGE_LABELS: Record<Stage, string> = {
  nursery: 'Nursery', primary: 'Primary', jss: 'Junior Secondary',
  sss: 'Senior Secondary', nd: 'ND', hnd: 'HND', nce: 'NCE', degree: 'Degree',
}

interface Props { appUser: AppUser }

interface StageCount { stage: string; count: number }

const PROMOTION_STAGES = ['nursery', 'primary', 'jss', 'sss'] as const

export default function K12Promotion({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [stageCounts, setStageCounts] = useState<StageCount[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('learner_enrollments')
      .select('stage')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        for (const row of data ?? []) {
          counts[row.stage] = (counts[row.stage] ?? 0) + 1
        }
        setStageCounts(Object.entries(counts).map(([stage, count]) => ({ stage, count })))
      })
  }, [schoolId])

  async function runPromotion() {
    if (!selected) return
    setLoading(true)
    setConfirmOpen(false)
    try {
      await flowExecute('learner.promote', schoolId, {
        stage: selected,
        academic_session: '2024/2025',
      })
      showToast(`Promotion run for ${STAGE_LABELS[selected as Stage] ?? selected}. Audit entry created.`)
      setSelected(null)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 5000) }

  const selectedCount = stageCounts.find(s => s.stage === selected)?.count ?? 0

  return (
    <>
      <Topbar title="Promotion" meta="Advance learners to the next level" />

      <div className="p-8 max-w-2xl">
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-5 py-4 mb-6 text-sm text-amber-800">
          <strong>Promotion is a logged, irreversible action.</strong> It advances all active learners in a stage to the next ordinal. Run at end of academic year only.
        </div>

        <Card>
          <CardHeader title="Select Stage to Promote" meta="Learners advance to the next level within their stage" />
          <div className="p-5 space-y-3">
            {PROMOTION_STAGES.map(stage => {
              const count = stageCounts.find(s => s.stage === stage)?.count ?? 0
              return (
                <label
                  key={stage}
                  className={`flex items-center justify-between p-4 border rounded-sm cursor-pointer transition-colors ${
                    selected === stage
                      ? 'border-navy-900 bg-navy-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="stage"
                      value={stage}
                      checked={selected === stage}
                      onChange={() => setSelected(stage)}
                      className="accent-navy-900"
                    />
                    <div>
                      <div className="text-sm font-semibold text-navy-900">{STAGE_LABELS[stage] ?? stage}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {count > 0 ? `${count} active learner${count !== 1 ? 's' : ''}` : 'No active learners'}
                      </div>
                    </div>
                  </div>
                  {count > 0 && (
                    <span className="text-xs font-bold text-navy-700 bg-navy-100 px-2 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          <div className="px-5 py-4 border-t border-gray-200 flex justify-end">
            <Button
              variant="amber"
              onClick={() => setConfirmOpen(true)}
              disabled={!selected || selectedCount === 0 || loading}
            >
              Run Promotion →
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm Promotion Run"
        message={<>This will advance <strong>{selectedCount}</strong> learner(s) in <strong>{STAGE_LABELS[(selected ?? '') as Stage] ?? selected}</strong> to the next level.</>}
        warning="This action is logged and cannot be reversed. Ensure term results have been finalised before promoting."
        confirmLabel="Run Promotion"
        confirmVariant="amber"
        onConfirm={runPromotion}
        onClose={() => setConfirmOpen(false)}
        loading={loading}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">{toast}</div>
      )}
    </>
  )
}
