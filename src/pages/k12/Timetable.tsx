import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field, Grid2 } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { AppUser, K12Class, K12Subject } from '../../types'

interface Props { appUser: AppUser }

interface Period {
  id: string
  school_id: string
  ordinal: number
  label: string
  start_time: string | null
  end_time: string | null
  is_break: boolean
}

interface Slot {
  id: string
  class_id: string
  period_id: string
  day_of_week: number
  subject_id: string | null
  subject?: { name: string }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function formatTime(t: string | null) {
  if (!t) return ''
  return t.slice(0, 5)
}

export default function K12Timetable({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id!

  const [tab, setTab] = useState<'periods' | 'grid'>('grid')
  const [periods, setPeriods] = useState<Period[]>([])
  const [classes, setClasses] = useState<K12Class[]>([])
  const [subjects, setSubjects] = useState<K12Subject[]>([])
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Period form
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [pForm, setPForm] = useState({ label: '', start_time: '', end_time: '', is_break: false })
  const [savingPeriod, setSavingPeriod] = useState(false)

  // Slot edit modal
  const [editSlot, setEditSlot]     = useState<{ periodId: string; day: number } | null>(null)
  const [slotSubject, setSlotSubject]   = useState('')
  const [slotTeacher, setSlotTeacher]   = useState('')
  const [savingSlot, setSavingSlot]     = useState(false)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function loadAll() {
    const [{ data: ps }, { data: cls }, { data: subs }, { data: teacherOffices }] = await Promise.all([
      supabase.from('k12_timetable_periods').select('*').eq('school_id', schoolId).order('ordinal'),
      supabase.from('k12_classes').select('*').eq('school_id', schoolId).order('stage').order('name'),
      supabase.from('k12_subjects').select('*').eq('school_id', schoolId).order('name'),
      supabase.from('offices').select('id').in('name', ['class_teacher', 'head_teacher']),
    ])
    setPeriods((ps ?? []) as Period[])
    setClasses((cls ?? []) as K12Class[])
    setSubjects((subs ?? []) as K12Subject[])
    if (!selectedClass && cls && cls.length > 0) setSelectedClass(cls[0].id)

    // Load teacher memberships
    const officeIds = (teacherOffices ?? []).map((o: any) => o.id)
    if (officeIds.length > 0) {
      const { data: mems } = await supabase
        .from('memberships')
        .select('id, profile:profiles(first_name, last_name)')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .in('office_id', officeIds)
      setTeachers(((mems ?? []) as any[]).map(m => ({
        id:   m.id,
        name: `${m.profile?.first_name ?? ''} ${m.profile?.last_name ?? ''}`.trim() || 'Unknown',
      })))
    }
  }

  async function loadSlots(classId: string) {
    if (!classId) return
    const { data } = await supabase
      .from('k12_timetable_slots')
      .select('*, subject:k12_subjects(name)')
      .eq('class_id', classId)
    setSlots((data ?? []) as Slot[])
  }

  useEffect(() => { loadAll() }, [schoolId])
  useEffect(() => { loadSlots(selectedClass) }, [selectedClass])

  async function addPeriod() {
    if (!pForm.label.trim()) return
    setSavingPeriod(true)
    const nextOrdinal = periods.length > 0 ? Math.max(...periods.map(p => p.ordinal)) + 1 : 1
    const { error } = await supabase.from('k12_timetable_periods').insert({
      school_id:  schoolId,
      ordinal:    nextOrdinal,
      label:      pForm.label.trim(),
      start_time: pForm.start_time || null,
      end_time:   pForm.end_time || null,
      is_break:   pForm.is_break,
    })
    setSavingPeriod(false)
    if (error) { flash(error.message, 'error'); return }
    setPForm({ label: '', start_time: '', end_time: '', is_break: false })
    setShowPeriodForm(false)
    flash('Period added.')
    loadAll()
  }

  async function deletePeriod(id: string) {
    await supabase.from('k12_timetable_periods').delete().eq('id', id)
    flash('Period removed.')
    loadAll()
  }

  function slotFor(periodId: string, day: number) {
    return slots.find(s => s.period_id === periodId && s.day_of_week === day)
  }

  function openEdit(periodId: string, day: number) {
    const existing = slotFor(periodId, day)
    setSlotSubject(existing?.subject_id ?? '')
    setSlotTeacher((existing as any)?.teacher_membership_id ?? '')
    setEditSlot({ periodId, day })
  }

  async function saveSlot() {
    if (!editSlot || !selectedClass) return
    setSavingSlot(true)
    const existing = slotFor(editSlot.periodId, editSlot.day)

    if (slotSubject === '' && existing) {
      await supabase.from('k12_timetable_slots').delete().eq('id', existing.id)
    } else if (slotSubject) {
      const payload = {
        subject_id:            slotSubject,
        teacher_membership_id: slotTeacher || null,
      }
      if (existing) {
        await supabase.from('k12_timetable_slots').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('k12_timetable_slots').insert({
          school_id:   schoolId,
          class_id:    selectedClass,
          period_id:   editSlot.periodId,
          day_of_week: editSlot.day,
          ...payload,
        })
      }
    }
    setSavingSlot(false)
    setEditSlot(null)
    flash('Timetable saved.')
    loadSlots(selectedClass)
  }

  function printTimetable() {
    const cls = classes.find(c => c.id === selectedClass)
    const rows = periods.map(p => {
      if (p.is_break) {
        return `<tr style="background:#f5f5f5"><td style="padding:6px 10px;font-size:11px;color:#888;font-style:italic">${p.label}</td>${DAYS.map(() => '<td style="padding:6px 10px;font-size:11px;color:#888;text-align:center">—</td>').join('')}</tr>`
      }
      const cells = DAYS.map((_, i) => {
        const slot = slotFor(p.id, i + 1)
        return `<td style="padding:6px 10px;font-size:12px;border:1px solid #eee">${slot?.subject?.name ?? ''}</td>`
      }).join('')
      return `<tr><td style="padding:6px 10px;font-size:11px;font-weight:bold;border:1px solid #eee">${p.label}<br><span style="font-weight:normal;color:#888">${formatTime(p.start_time)}${p.start_time && p.end_time ? '–' : ''}${formatTime(p.end_time)}</span></td>${cells}</tr>`
    }).join('')

    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return
    win.document.write(`
      <html><head><title>Timetable — ${cls?.name}</title>
      <style>body{font-family:sans-serif;padding:24px} table{border-collapse:collapse;width:100%} th{background:#1a2744;color:#fff;padding:8px 10px;font-size:11px;text-align:left}</style>
      </head><body>
      <div style="font-size:18px;font-weight:bold;margin-bottom:4px">${appUser.activeSchool?.name}</div>
      <div style="font-size:14px;color:#666;margin-bottom:16px">Weekly Timetable — ${cls?.name}</div>
      <table>
        <thead><tr><th>Period</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `)
    win.document.close()
  }

  const selectedClassObj = classes.find(c => c.id === selectedClass)

  return (
    <>
      <Topbar title="Timetable" meta={appUser.activeSchool?.name} />

      <div className="p-8 space-y-6">
        {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['grid', 'periods'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                tab === t
                  ? 'border-navy-900 text-navy-900'
                  : 'border-transparent text-gray-400 hover:text-navy-700'
              )}
            >
              {t === 'grid' ? 'Class Timetable' : 'Period Setup'}
            </button>
          ))}
        </div>

        {/* ── PERIODS TAB ── */}
        {tab === 'periods' && (
          <div className="max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Define your school's daily time periods. Breaks appear as shaded rows on the grid.</div>
              <Button variant="primary" size="sm" onClick={() => setShowPeriodForm(v => !v)}>+ Add Period</Button>
            </div>

            {showPeriodForm && (
              <Card className="p-5">
                <div className="text-sm font-bold text-navy-900 mb-4">New Period / Break</div>
                <Grid2>
                  <Field label="Label" required>
                    <Input placeholder="e.g. Period 1, Morning Break" value={pForm.label}
                      onChange={e => setPForm(f => ({ ...f, label: e.target.value }))} />
                  </Field>
                  <Field label="">
                    <label className="flex items-center gap-2 mt-6 cursor-pointer">
                      <input type="checkbox" checked={pForm.is_break}
                        onChange={e => setPForm(f => ({ ...f, is_break: e.target.checked }))}
                        className="rounded border-gray-300" />
                      <span className="text-sm text-navy-800">This is a break period</span>
                    </label>
                  </Field>
                  <Field label="Start Time">
                    <Input type="time" value={pForm.start_time}
                      onChange={e => setPForm(f => ({ ...f, start_time: e.target.value }))} />
                  </Field>
                  <Field label="End Time">
                    <Input type="time" value={pForm.end_time}
                      onChange={e => setPForm(f => ({ ...f, end_time: e.target.value }))} />
                  </Field>
                </Grid2>
                <div className="flex gap-2 mt-4">
                  <Button variant="primary" size="sm" onClick={addPeriod} disabled={savingPeriod || !pForm.label}>
                    {savingPeriod ? 'Saving…' : 'Add Period'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowPeriodForm(false)}>Cancel</Button>
                </div>
              </Card>
            )}

            <Card>
              {periods.length === 0 ? (
                <div className="px-5 py-10 text-sm text-gray-400 text-center">No periods defined yet.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['#', 'Label', 'Time', 'Type', ''].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map(p => (
                      <tr key={p.id} className={cn('border-b border-gray-50', p.is_break ? 'bg-gray-50/60' : 'hover:bg-gray-50/40')}>
                        <td className="px-5 py-3 text-sm font-mono text-gray-400">{p.ordinal}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-navy-900">{p.label}</td>
                        <td className="px-5 py-3 text-sm text-gray-500 font-mono">
                          {p.start_time && p.end_time ? `${formatTime(p.start_time)} – ${formatTime(p.end_time)}` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {p.is_break
                            ? <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Break</span>
                            : <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Lesson</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => deletePeriod(p.id)} className="text-gray-300 hover:text-red-400 text-xs">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}

        {/* ── GRID TAB ── */}
        {tab === 'grid' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-56">
                <Select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  placeholder="Select class…"
                  options={classes.map(c => ({ value: c.id, label: `${c.name} (${c.stage.toUpperCase()})` }))}
                />
              </div>
              {selectedClass && (
                <Button variant="ghost" size="sm" onClick={printTimetable}>Print / PDF</Button>
              )}
            </div>

            {periods.length === 0 ? (
              <Card className="py-12 text-center">
                <div className="text-sm text-gray-400 mb-2">No periods defined.</div>
                <button onClick={() => setTab('periods')} className="text-sm font-semibold text-navy-700 hover:underline">
                  Go to Period Setup →
                </button>
              </Card>
            ) : !selectedClass ? (
              <Card className="py-12 text-center">
                <div className="text-sm text-gray-400">Select a class to view its timetable.</div>
              </Card>
            ) : (
              <Card>
                <CardHeader title={`${selectedClassObj?.name ?? ''} — Weekly Timetable`} meta="Click a cell to assign a subject" />
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500 text-left w-32">Period</th>
                        {DAYS.map(d => (
                          <th key={d} className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500 text-center">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map(p => (
                        <tr key={p.id} className={cn('border-b border-gray-100', p.is_break && 'bg-gray-50')}>
                          <td className="px-4 py-3">
                            <div className="text-xs font-bold text-navy-800">{p.label}</div>
                            {(p.start_time || p.end_time) && (
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                {formatTime(p.start_time)}{p.start_time && p.end_time ? '–' : ''}{formatTime(p.end_time)}
                              </div>
                            )}
                            {p.is_break && <div className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">Break</div>}
                          </td>
                          {DAYS.map((_, i) => {
                            const slot = slotFor(p.id, i + 1)
                            if (p.is_break) {
                              return <td key={i} className="px-4 py-3 text-center text-xs text-gray-300">—</td>
                            }
                            return (
                              <td key={i} className="px-2 py-2">
                                <button
                                  onClick={() => openEdit(p.id, i + 1)}
                                  className={cn(
                                    'w-full min-h-[52px] rounded-sm border text-left px-3 py-2 text-xs transition-colors',
                                    slot?.subject
                                      ? 'bg-navy-50 border-navy-200 text-navy-900 hover:bg-navy-100'
                                      : 'bg-gray-50 border-dashed border-gray-200 text-gray-300 hover:border-navy-300 hover:text-navy-400'
                                  )}
                                >
                                  {slot?.subject
                                    ? <span className="font-semibold leading-tight block">{slot.subject.name}</span>
                                    : <span className="text-[10px]">+ assign</span>}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Slot edit modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <Card className="w-80 p-6 shadow-modal">
            <div className="text-sm font-bold text-navy-900 mb-1">Assign Subject</div>
            <div className="text-xs text-gray-400 mb-4">
              {DAYS[editSlot.day - 1]} · {periods.find(p => p.id === editSlot.periodId)?.label}
            </div>
            <Field label="Subject">
              <Select
                value={slotSubject}
                onChange={e => setSlotSubject(e.target.value)}
                placeholder="— clear slot —"
                options={subjects.map(s => ({ value: s.id, label: s.name }))}
              />
            </Field>
            {teachers.length > 0 && (
              <Field label="Teacher">
                <Select
                  value={slotTeacher}
                  onChange={e => setSlotTeacher(e.target.value)}
                  placeholder="— unassigned —"
                  options={teachers.map(t => ({ value: t.id, label: t.name }))}
                />
              </Field>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="primary" size="sm" onClick={saveSlot} disabled={savingSlot}>
                {savingSlot ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditSlot(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
