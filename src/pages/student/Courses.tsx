import { useEffect, useState } from 'react'
import { Card, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select, Field } from '../../components/ui/Form'
import { ResultStatusBadge } from '../../components/ui/Badge'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser, AcademicSession, Semester } from '../../types'

interface Props { appUser: AppUser }

interface Offering {
  id: string
  course_id: string
  results_status: string
  course?: { code: string; title: string; credit_units: number }
  isRegistered?: boolean
  regId?: string
}

interface MaterialWithContext {
  id: string
  title: string
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  created_at: string
  session_label: string
  semester_label: string
}

interface MaterialGroup {
  key: string
  session_label: string
  semester_label: string
  materials: MaterialWithContext[]
}

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
}

export default function StudentCourses({ appUser }: Props) {
  const ctx       = useStudentContext(appUser)
  const schoolId  = appUser.activeSchool?.id ?? ''

  const [sessions,  setSessions]  = useState<AcademicSession[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [selectedSession,  setSelectedSession]  = useState('')
  const [selectedSemester, setSelectedSemester] = useState('')
  const [registering, setRegistering] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [expandedMaterials, setExpandedMaterials]       = useState<string | null>(null)
  const [materialsCache, setMaterialsCache]             = useState<Record<string, MaterialGroup[]>>({})
  const [expandedAnnouncements, setExpandedAnnouncements] = useState<string | null>(null)
  const [announcementsCache, setAnnouncementsCache]     = useState<Record<string, Announcement[]>>({})

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (!schoolId) return
    supabase.from('academic_sessions').select('*').eq('school_id', schoolId).order('created_at', { ascending: false })
      .then(({ data }) => {
        setSessions((data ?? []) as AcademicSession[])
        if (data && data[0]) setSelectedSession(data[0].id)
      })
  }, [schoolId])

  useEffect(() => {
    if (!selectedSession) return
    supabase.from('semesters').select('*').eq('session_id', selectedSession).order('ordinal')
      .then(({ data }) => {
        setSemesters((data ?? []) as Semester[])
        setSelectedSemester('')
        setOfferings([])
      })
  }, [selectedSession])

  useEffect(() => {
    if (!selectedSemester || !ctx.studentId) return
    loadOfferings()
  }, [selectedSemester, ctx.studentId])

  async function loadOfferings() {
    if (!selectedSemester || !ctx.studentId) return
    const [{ data: offs }, { data: regs }] = await Promise.all([
      supabase.from('course_offerings').select('id, course_id, results_status, course:courses(code, title, credit_units)')
        .eq('semester_id', selectedSemester).order('created_at'),
      supabase.from('course_registrations').select('id, offering_id')
        .eq('student_id', ctx.studentId),
    ])
    const regMap: Record<string, string> = {}
    for (const r of (regs ?? [])) regMap[r.offering_id] = r.id

    setOfferings(((offs ?? []) as unknown as Offering[]).map(o => ({
      ...o,
      isRegistered: !!regMap[o.id],
      regId: regMap[o.id],
    })))
  }

  async function registerCourse(offeringId: string) {
    if (!ctx.studentId) return
    setRegistering(offeringId)
    const { error } = await supabase.from('course_registrations').insert({
      offering_id: offeringId,
      student_id: ctx.studentId,
    })
    setRegistering(null)
    if (error) { flash(error.message, 'error'); return }
    flash('Course registered.')
    loadOfferings()
  }

  async function toggleMaterials(offeringId: string, courseId: string) {
    if (expandedMaterials === offeringId) { setExpandedMaterials(null); return }
    setExpandedMaterials(offeringId)
    if (materialsCache[offeringId]) return

    // Load all offerings for this course (across all sessions/semesters)
    const { data: allOfferings } = await supabase
      .from('course_offerings')
      .select('id, semester:semesters!semester_id(label, session:academic_sessions!session_id(label, created_at))')
      .eq('course_id', courseId)

    if (!allOfferings?.length) {
      setMaterialsCache(prev => ({ ...prev, [offeringId]: [] }))
      return
    }

    const offeringIds = allOfferings.map((o: any) => o.id)

    // Load materials from ALL those offerings
    const { data: mats } = await supabase
      .from('course_materials')
      .select('id, title, file_name, file_path, file_size, file_type, created_at, offering_id')
      .in('offering_id', offeringIds)
      .order('created_at', { ascending: false })

    // Build a lookup: offering_id → session/semester labels
    const ctxMap: Record<string, { session_label: string; semester_label: string; session_created_at: string }> = {}
    for (const o of (allOfferings as any[])) {
      ctxMap[o.id] = {
        session_label:       o.semester?.session?.label    ?? 'Unknown session',
        semester_label:      o.semester?.label             ?? 'Unknown semester',
        session_created_at:  o.semester?.session?.created_at ?? '',
      }
    }

    // Group materials by "session · semester", newest session first
    const groupMap: Record<string, MaterialWithContext[]> = {}
    for (const mat of (mats ?? []) as any[]) {
      const ctx = ctxMap[mat.offering_id]
      if (!ctx) continue
      const key = `${ctx.session_label}__${ctx.semester_label}`
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push({ ...mat, session_label: ctx.session_label, semester_label: ctx.semester_label })
    }

    const groups: MaterialGroup[] = Object.entries(groupMap)
      .map(([key, materials]) => ({
        key,
        session_label:  materials[0].session_label,
        semester_label: materials[0].semester_label,
        materials,
      }))
      // Sort: current offering's group first, then by newest session
      .sort((a, b) => {
        const aIsCurrent = allOfferings.some((o: any) => o.id === offeringId && ctxMap[o.id]?.session_label === a.session_label)
        const bIsCurrent = allOfferings.some((o: any) => o.id === offeringId && ctxMap[o.id]?.session_label === b.session_label)
        if (aIsCurrent && !bIsCurrent) return -1
        if (bIsCurrent && !aIsCurrent) return 1
        return b.session_label.localeCompare(a.session_label)
      })

    setMaterialsCache(prev => ({ ...prev, [offeringId]: groups }))
  }

  async function downloadMaterial(mat: MaterialWithContext) {
    const { data } = await supabase.storage
      .from('course-materials')
      .createSignedUrl(mat.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function toggleAnnouncements(offeringId: string, courseId: string) {
    if (expandedAnnouncements === offeringId) { setExpandedAnnouncements(null); return }
    setExpandedAnnouncements(offeringId)
    if (announcementsCache[offeringId] !== undefined) return

    // Load all offering IDs for this course (same cross-semester logic as materials)
    const { data: allOfferings } = await supabase
      .from('course_offerings')
      .select('id')
      .eq('course_id', courseId)

    if (!allOfferings?.length) {
      setAnnouncementsCache(prev => ({ ...prev, [offeringId]: [] }))
      return
    }

    const offeringIds = allOfferings.map((o: any) => o.id)

    const { data: anns } = await supabase
      .from('course_announcements')
      .select('id, title, body, created_at')
      .in('offering_id', offeringIds)
      .order('created_at', { ascending: false })

    setAnnouncementsCache(prev => ({ ...prev, [offeringId]: (anns ?? []) as Announcement[] }))
  }

  async function dropCourse(regId: string) {
    await supabase.from('course_registrations').delete().eq('id', regId)
    flash('Course dropped.')
    loadOfferings()
  }

  const registeredCount = offerings.filter(o => o.isRegistered).length
  const totalCU = offerings.filter(o => o.isRegistered).reduce((s, o) => s + (o.course?.credit_units ?? 0), 0)

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-xl font-bold text-navy-900">My Courses</div>
        <div className="text-sm text-gray-400 mt-0.5">Register for courses each semester</div>
      </div>

      {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

      {/* Semester selector */}
      <Card className="p-5">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="w-48">
            <Field label="Session">
              <Select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
                placeholder="Select session…"
                options={sessions.map(s => ({ value: s.id, label: s.label }))} />
            </Field>
          </div>
          <div className="w-48">
            <Field label="Semester">
              <Select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value)}
                placeholder={selectedSession ? 'Select semester…' : '—'}
                options={semesters.map(s => ({ value: s.id, label: s.label }))} />
            </Field>
          </div>
          {registeredCount > 0 && (
            <div className="text-sm text-gray-500 pb-1">
              {registeredCount} registered · {totalCU} credit unit{totalCU !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </Card>

      {selectedSemester && offerings.length === 0 && (
        <Card className="py-12 text-center">
          <div className="text-sm text-gray-400">No course offerings for this semester.</div>
        </Card>
      )}

      {offerings.map(o => {
        const mats: MaterialGroup[] = materialsCache[o.id] ?? []
        const isExpanded = expandedMaterials === o.id
        const anns: Announcement[] = announcementsCache[o.id] ?? []
        const isAnnsExpanded = expandedAnnouncements === o.id
        return (
          <Card key={o.id} className="overflow-hidden p-0">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-navy-700">{o.course?.code}</span>
                    {o.isRegistered && (
                      <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded">REGISTERED</span>
                    )}
                  </div>
                  <div className="text-sm text-navy-900 mt-0.5">{o.course?.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{o.course?.credit_units} credit unit{o.course?.credit_units !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {o.isRegistered && (
                  <button
                    onClick={() => toggleAnnouncements(o.id, o.course_id)}
                    className="text-xs text-navy-500 hover:text-navy-800 flex items-center gap-1 transition-colors">
                    Announcements{anns.length > 0 ? ` (${anns.length})` : ''} {isAnnsExpanded ? '▲' : '▼'}
                  </button>
                )}
                {o.isRegistered && (
                  <button
                    onClick={() => toggleMaterials(o.id, o.course_id)}
                    className="text-xs text-navy-500 hover:text-navy-800 flex items-center gap-1 transition-colors">
                    Materials {isExpanded ? '▲' : '▼'}
                  </button>
                )}
                <ResultStatusBadge status={o.results_status as import('../../types').ResultStatus} />
                {o.isRegistered ? (
                  o.results_status === 'draft' && (
                    <Button variant="ghost" size="sm" onClick={() => o.regId && dropCourse(o.regId)}>
                      Drop
                    </Button>
                  )
                ) : (
                  o.results_status === 'draft' ? (
                    <Button variant="primary" size="sm"
                      onClick={() => registerCourse(o.id)}
                      disabled={registering === o.id}>
                      {registering === o.id ? '…' : 'Register'}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-300">Closed</span>
                  )
                )}
              </div>
            </div>

            {/* Announcements panel */}
            {o.isRegistered && isAnnsExpanded && (
              <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                {announcementsCache[o.id] === undefined ? (
                  <div className="text-xs text-gray-400 py-2">Loading…</div>
                ) : anns.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2">No announcements for this course yet.</div>
                ) : (
                  <div className="space-y-3">
                    {anns.map(ann => (
                      <div key={ann.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <div className="text-sm font-semibold text-navy-900">{ann.title}</div>
                          <div className="text-[10px] text-gray-400 flex-shrink-0">
                            {new Date(ann.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{ann.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Materials panel */}
            {o.isRegistered && isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                {!materialsCache[o.id] ? (
                  <div className="text-xs text-gray-400 py-2">Loading…</div>
                ) : mats.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2">No materials uploaded for this course yet.</div>
                ) : (
                  <div className="space-y-5">
                    {mats.map(group => (
                      <div key={group.key}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-navy-400">
                            {group.session_label}
                          </span>
                          <span className="text-[10px] text-gray-400">·</span>
                          <span className="text-[10px] text-gray-400">{group.semester_label}</span>
                        </div>
                        <div className="space-y-1.5">
                          {group.materials.map(mat => (
                            <div key={mat.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">

                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-navy-900 truncate">{mat.title}</div>
                                <div className="text-[11px] text-gray-400 truncate">{mat.file_name}</div>
                              </div>
                              <button
                                onClick={() => downloadMaterial(mat)}
                                className="text-xs px-3 py-1.5 bg-navy-700 hover:bg-navy-800 text-white rounded transition-colors flex-shrink-0">
                                Download
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
