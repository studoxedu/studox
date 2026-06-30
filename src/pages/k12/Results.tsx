import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { Field, Textarea } from '../../components/ui/Form'
import { flowExecute, supabase } from '../../lib/supabase'
import { computeGrade } from '../../lib/utils'
import type { AppUser, LearnerEnrollment } from '../../types'

interface Props { appUser: AppUser }

interface ScoreRow {
  enrollmentId: string
  learnerId: string
  name: string
  ca: string
  exam: string
  caError?: string
  examError?: string
}

export default function K12Results({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [enrollments, setEnrollments] = useState<LearnerEnrollment[]>([])
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [session] = useState('2024/2025')
  const [term] = useState<1 | 2 | 3>(3)
  const [loading, setLoading] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenNote, setReopenNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('learner_enrollments')
      .select('*, learner:learners(*)')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('created_at')
      .then(({ data }) => {
        const en = (data ?? []) as LearnerEnrollment[]
        setEnrollments(en)
        setRows(en.map(e => ({
          enrollmentId: e.id,
          learnerId: e.learner?.learner_id ?? '',
          name: `${e.learner?.first_name ?? ''} ${e.learner?.last_name ?? ''}`.trim(),
          ca: '',
          exam: '',
        })))
      })
  }, [schoolId])

  function validateRow(row: ScoreRow): ScoreRow {
    const caNum = parseFloat(row.ca)
    const examNum = parseFloat(row.exam)
    return {
      ...row,
      caError: row.ca && (isNaN(caNum) || caNum < 0 || caNum > 40) ? 'CA must be 0–40' : undefined,
      examError: row.exam && (isNaN(examNum) || examNum < 0 || examNum > 60) ? 'Exam must be 0–60' : undefined,
    }
  }

  function updateRow(index: number, field: 'ca' | 'exam', value: string) {
    setRows(prev => {
      const next = [...prev]
      next[index] = validateRow({ ...next[index], [field]: value })
      return next
    })
  }

  const hasErrors = rows.some(r => r.caError || r.examError)
  const enteredCount = rows.filter(r => r.ca !== '' && r.exam !== '').length

  async function finalize() {
    setLoading(true)
    setFinalizeOpen(false)
    try {
      // Build scores object per enrollment
      for (const row of rows) {
        if (!row.ca || !row.exam) continue
        await flowExecute('results.finalize', schoolId, {
          enrollment_id: row.enrollmentId,
          academic_session: session,
          term,
          scores: { ca: parseFloat(row.ca), exam: parseFloat(row.exam) },
        })
      }
      showToast('Results finalized and published.')
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function reopen() {
    setLoading(true)
    setReopenOpen(false)
    try {
      // Reopen for the first enrollment as example
      if (enrollments[0]) {
        await flowExecute('results.reopen', schoolId, {
          enrollment_id: enrollments[0].id,
          academic_session: session,
          term,
          correction_note: reopenNote,
        })
      }
      showToast('Results reopened for correction. Audit entry created.')
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <>
      <Topbar
        title="Results Entry"
        meta={`${session} · Term ${term}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReopenOpen(true)}>
              Reopen for Correction
            </Button>
            <Button
              variant="amber"
              size="sm"
              onClick={() => setFinalizeOpen(true)}
              disabled={hasErrors || enteredCount === 0 || loading}
            >
              Finalize Results
            </Button>
          </div>
        }
      />

      <div className="p-8">
        {/* Config bar */}
        <div className="bg-white border border-gray-200 rounded-sm p-4 mb-6 grid grid-cols-5 gap-4">
          {[
            { label: 'Course / Subject', value: 'All Subjects' },
            { label: 'Session',          value: session },
            { label: 'Term',             value: `Term ${term}` },
            { label: 'Registered',       value: `${rows.length} learners` },
            { label: 'Entered',          value: `${enteredCount} / ${rows.length}` },
          ].map(f => (
            <div key={f.label}>
              <div className="label mb-1">{f.label}</div>
              <div className="text-sm font-semibold text-navy-900">{f.value}</div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Score Entry"
            meta="CA max: 40 · Exam max: 60 · Total: 100"
          />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['#', 'Learner', 'Learner ID', 'CA (40)', 'Exam (60)', 'Total', 'Grade'].map(h => (
                  <th key={h} className={`px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500 ${['CA (40)', 'Exam (60)', 'Total', 'Grade'].includes(h) ? 'text-center' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const caNum = parseFloat(row.ca)
                const examNum = parseFloat(row.exam)
                const total = (!isNaN(caNum) && !isNaN(examNum) && !row.caError && !row.examError)
                  ? caNum + examNum : null
                const { grade } = total !== null ? computeGrade(total) : { grade: '' }

                return (
                  <tr key={row.enrollmentId} className="border-b border-gray-50 hover:bg-gray-50/40">
                    <td className="px-4 py-2.5 text-xs text-gray-400 w-8">{i + 1}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-navy-900">{row.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{row.learnerId}</td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        value={row.ca}
                        onChange={e => updateRow(i, 'ca', e.target.value)}
                        className={`w-16 px-2 py-1.5 border rounded-sm text-sm text-center outline-none font-mono ${row.caError ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-navy-900'}`}
                        min={0} max={40} placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        value={row.exam}
                        onChange={e => updateRow(i, 'exam', e.target.value)}
                        className={`w-16 px-2 py-1.5 border rounded-sm text-sm text-center outline-none font-mono ${row.examError ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-navy-900'}`}
                        min={0} max={60} placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-bold text-sm">
                      {total !== null ? total : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {grade ? (
                        <Badge
                          label={grade}
                          bg={grade === 'A' ? 'bg-green-100' : grade === 'F' ? 'bg-red-100' : 'bg-blue-100'}
                          text={grade === 'A' ? 'text-green-700' : grade === 'F' ? 'text-red-700' : 'text-blue-700'}
                        />
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-5 py-3.5 border-t border-gray-200 flex justify-between items-center">
            <span className="text-xs text-gray-400">
              {hasErrors ? 'Validation errors — fix before finalizing' : `${enteredCount} of ${rows.length} entries complete`}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm">Save Draft</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setFinalizeOpen(true)}
                disabled={hasErrors || enteredCount === 0}
              >
                Finalize Results →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Finalize confirm */}
      <ConfirmModal
        open={finalizeOpen}
        title="Finalize Term Results"
        message={<>Finalizing will publish results for <strong>{enteredCount}</strong> learner(s) — Term {term}, {session}. Results become immediately visible.</>}
        warning="This is a single write action (K12 mode). Results are immediately published. Use Reopen for Correction only if an entry error is found afterward."
        confirmLabel="Finalize Results"
        confirmVariant="amber"
        onConfirm={finalize}
        onClose={() => setFinalizeOpen(false)}
        loading={loading}
      />

      {/* Reopen modal */}
      <Modal
        open={reopenOpen}
        title="Reopen for Correction"
        onClose={() => setReopenOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={reopen} disabled={!reopenNote.trim() || loading}>
              ← Reopen
            </Button>
          </>
        }
      >
        <div className="mb-4 text-sm text-gray-600">
          This is a logged action. The correction note is written to the audit log and cannot be edited.
        </div>
        <Field label="Correction Note" required>
          <Textarea
            value={reopenNote}
            onChange={e => setReopenNote(e.target.value)}
            placeholder="Describe the reason for reopening…"
          />
        </Field>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">
          {toast}
        </div>
      )}
    </>
  )
}
