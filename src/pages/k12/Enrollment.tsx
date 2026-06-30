import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input, Select, Checkbox, Grid2 } from '../../components/ui/Form'
import { EnrollmentStatusBadge } from '../../components/ui/Badge'
import { flowExecute, supabase } from '../../lib/supabase'
import { notify } from '../../lib/notifications'
import { formatDate, STAGE_LABELS } from '../../lib/utils'
import type { AppUser, LearnerEnrollment, K12Class, Stage } from '../../types'

interface Props { appUser: AppUser }

const K12_STAGES: Stage[] = ['nursery', 'primary', 'jss', 'sss']

export default function K12Enrollment({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id ?? ''
  const [enrollments, setEnrollments] = useState<LearnerEnrollment[]>([])
  const [classes, setClasses]         = useState<K12Class[]>([])
  const [loading, setLoading]         = useState(true)
  const [enrollOpen, setEnrollOpen]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  // Inline class assignment
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '',
    stage: '' as Stage | '',
    class_id: '',
    guardian_consent_captured: false,
  })

  function loadData() {
    Promise.all([
      supabase
        .from('learner_enrollments')
        .select('*, learner:learners(*), class:k12_classes(name)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false }),
      supabase
        .from('k12_classes')
        .select('*')
        .eq('school_id', schoolId)
        .order('stage').order('name'),
    ]).then(([{ data: en }, { data: cls }]) => {
      setEnrollments((en ?? []) as LearnerEnrollment[])
      setClasses((cls ?? []) as K12Class[])
      setLoading(false)
    })
  }

  useEffect(() => { if (schoolId) loadData() }, [schoolId])

  async function handleEnroll() {
    if (!form.first_name || !form.last_name || !form.stage) return
    setSaving(true)
    try {
      const result = await flowExecute('learner.enroll', schoolId, {
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        stage: form.stage,
        guardian_consent_captured: form.guardian_consent_captured,
      })

      // Assign class if selected — direct update (class assignment is metadata, not a governed action)
      if (form.class_id && result?.result?.enrollment_id) {
        await supabase
          .from('learner_enrollments')
          .update({ class_id: form.class_id })
          .eq('id', result.result.enrollment_id as string)
      }

      setEnrollOpen(false)
      setForm({ first_name: '', last_name: '', date_of_birth: '', stage: '', class_id: '', guardian_consent_captured: false })
      loadData()
      showToast('Learner enrolled successfully.')
      notify(appUser.profile.id, schoolId, 'Learner enrolled', {
        body: `${form.first_name} ${form.last_name} enrolled in ${form.stage.toUpperCase()}`,
        type: 'success',
        link: '/k12/enrollment',
      })
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setSaving(false)
    }
  }

  async function assignClass(enrollmentId: string, classId: string) {
    setAssigningId(enrollmentId)
    await supabase
      .from('learner_enrollments')
      .update({ class_id: classId || null })
      .eq('id', enrollmentId)
    setAssigningId(null)
    loadData()
  }

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 4000)
  }

  const availableStages = (appUser.activeSchool?.stages_offered ?? [])
    .filter(s => K12_STAGES.includes(s as Stage)) as Stage[]

  const classesForStage = (stage: Stage) => classes.filter(c => c.stage === stage)

  return (
    <>
      <Topbar
        title="Enrollment"
        meta={`${enrollments.length} learners`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setEnrollOpen(true)}>
            + Enroll Learner
          </Button>
        }
      />

      <div className="p-8">
        <Card>
          <CardHeader title="All Learners" meta={`${enrollments.length} total`} />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Learner', 'Learner ID', 'Stage', 'Class', 'Entry Date', 'Status', 'Consent'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</td></tr>
              ) : enrollments.map(en => (
                <tr key={en.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-sm font-semibold text-navy-900">
                    {en.learner?.first_name} {en.learner?.last_name}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{en.learner?.learner_id}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{STAGE_LABELS[en.stage] ?? en.stage}</td>
                  <td className="px-5 py-3">
                    {assigningId === en.id ? (
                      <span className="text-xs text-gray-400">Saving…</span>
                    ) : (
                      <select
                        value={(en as any).class_id ?? ''}
                        onChange={e => assignClass(en.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-sm px-2 py-1 text-navy-800 bg-white focus:outline-none focus:border-navy-400 max-w-[140px]"
                      >
                        <option value="">— unassigned —</option>
                        {classesForStage(en.stage).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(en.entry_date)}</td>
                  <td className="px-5 py-3"><EnrollmentStatusBadge status={en.status} /></td>
                  <td className="px-5 py-3 text-sm">
                    {en.guardian_consent_captured
                      ? <span className="text-green-600 font-semibold">Captured</span>
                      : <span className="text-red-500">Missing</span>}
                  </td>
                </tr>
              ))}
              {!loading && enrollments.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-sm text-gray-400 text-center">No learners enrolled yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Enroll modal */}
      <Modal
        open={enrollOpen}
        title="Enroll Learner"
        onClose={() => setEnrollOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleEnroll}
              disabled={saving || !form.first_name || !form.last_name || !form.stage}
            >
              {saving ? 'Enrolling…' : '+ Enroll Learner'}
            </Button>
          </>
        }
      >
        <Grid2>
          <Field label="First Name" required>
            <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="e.g. Adaeze" />
          </Field>
          <Field label="Last Name" required>
            <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="e.g. Okafor" />
          </Field>
        </Grid2>
        <Field label="Date of Birth">
          <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
        </Field>
        <Field label="Stage" required>
          <Select
            value={form.stage}
            onChange={e => setForm(f => ({ ...f, stage: e.target.value as Stage, class_id: '' }))}
            options={availableStages.map(s => ({ value: s, label: STAGE_LABELS[s] }))}
            placeholder="Select stage…"
          />
        </Field>
        {form.stage && classesForStage(form.stage as Stage).length > 0 && (
          <Field label="Assign to Class">
            <Select
              value={form.class_id}
              onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
              options={classesForStage(form.stage as Stage).map(c => ({ value: c.id, label: c.name }))}
              placeholder="Select class (optional)…"
            />
          </Field>
        )}
        <Checkbox
          label={<><strong>Guardian consent captured and timestamped</strong> — required under NDPA 2023 for minors</>}
          checked={form.guardian_consent_captured}
          onChange={v => setForm(f => ({ ...f, guardian_consent_captured: v }))}
        />
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy-900 text-white px-5 py-3 rounded-sm shadow-modal text-sm z-50">
          {toast}
        </div>
      )}
    </>
  )
}
