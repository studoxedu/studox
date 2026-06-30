import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Topbar } from '../../components/layout/Topbar'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface Scope {
  department_id: string | null
  faculty_id: string | null
  label: string
}

interface Offering {
  id: string
  results_status: string
  course: {
    id: string
    code: string
    title: string
    department_id: string
    department: { id: string; name: string; faculty_id: string } | null
  } | null
  semester: {
    label: string
    session: { label: string } | null
  } | null
  lecturer: {
    profile: { first_name: string | null; last_name: string | null } | null
  } | null
}

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-yellow-50 text-yellow-700',
  verified:  'bg-blue-50 text-blue-700',
  approved:  'bg-purple-50 text-purple-700',
  published: 'bg-green-50 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  draft:     'Draft',
  submitted: 'Submitted',
  verified:  'Verified',
  approved:  'Approved',
  published: 'Published',
}

export default function ScoreReview({ appUser }: Props) {
  const navigate    = useNavigate()
  const schoolId    = appUser.activeSchool?.id ?? ''
  const userId      = appUser.profile.id
  const officeName  = appUser.activeMembership?.office?.name ?? ''

  const isExamOfficer = ['exam_officer', 'dept_exam_officer', 'faculty_exam_officer'].includes(officeName)
  const isHOD         = officeName === 'hod'
  const isDean        = officeName === 'dean'

  // Only exam officers may access this page — redirect everyone else immediately
  useEffect(() => {
    if (!isExamOfficer) navigate('/tertiary/acadex', { replace: true })
  }, [isExamOfficer, navigate])

  if (!isExamOfficer) return null

  const [scope,       setScope]       = useState<Scope | null | undefined>(undefined) // undefined = loading
  const [offerings,   setOfferings]   = useState<Offering[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<string>('all')
  const [acting,      setActing]      = useState<string | null>(null)

  // Load scope from office_assignments
  useEffect(() => {
    async function loadScope() {
      if (officeName === 'exam_officer') {
        // Institution-wide exam officer — no department/faculty restriction
        setScope(null)
        return
      }
      const { data: assigns } = await supabase
        .from('office_assignments')
        .select('office_instance_id')
        .eq('profile_id', userId)
        .limit(1)

      const instanceId = assigns?.[0]?.office_instance_id
      if (!instanceId) { setScope(null); return }

      const { data: inst } = await supabase
        .from('office_instances')
        .select('department_id, faculty_id, label')
        .eq('id', instanceId)
        .single()

      setScope(inst
        ? { department_id: inst.department_id ?? null, faculty_id: inst.faculty_id ?? null, label: inst.label }
        : null
      )
    }
    if (userId) loadScope()
  }, [userId, officeName])

  const loadOfferings = useCallback(async () => {
    if (!schoolId || scope === undefined) return
    setLoading(true)

    // Resolve school → semesters
    const { data: sessData } = await supabase
      .from('academic_sessions').select('id').eq('school_id', schoolId)
    const sessionIds = (sessData ?? []).map((s: any) => s.id)
    if (!sessionIds.length) { setOfferings([]); setLoading(false); return }

    const { data: semData } = await supabase
      .from('semesters').select('id').in('session_id', sessionIds)
    const semIds = (semData ?? []).map((s: any) => s.id)
    if (!semIds.length) { setOfferings([]); setLoading(false); return }

    const { data: offsData } = await supabase
      .from('course_offerings')
      .select(`
        id, results_status,
        course:courses!course_id(
          id, code, title, department_id,
          department:departments!department_id(id, name, faculty_id)
        ),
        semester:semesters!semester_id(
          label, session:academic_sessions!session_id(label)
        ),
        lecturer:memberships!lecturer_membership_id(
          profile:profiles!profile_id(first_name, last_name)
        )
      `)
      .in('semester_id', semIds)
      .order('created_at', { ascending: false })

    let filtered = (offsData ?? []) as unknown as Offering[]

    // Scope filter — narrow to dept or faculty
    // Non-exam-officers with no scope see nothing (not all courses)
    if (scope?.department_id) {
      filtered = filtered.filter(o => o.course?.department_id === scope.department_id)
    } else if (scope?.faculty_id) {
      filtered = filtered.filter(o => (o.course?.department as any)?.faculty_id === scope.faculty_id)
    } else if (scope === null && !isExamOfficer) {
      filtered = []
    }

    // Status visibility by role
    if (isHOD) {
      filtered = filtered.filter(o => ['verified', 'approved', 'published'].includes(o.results_status))
    } else if (isDean) {
      filtered = filtered.filter(o => ['approved', 'published'].includes(o.results_status))
    }
    // Exam officer sees all statuses

    setOfferings(filtered)
    setLoading(false)
  }, [schoolId, scope, isHOD, isDean])

  useEffect(() => { loadOfferings() }, [loadOfferings])

  async function act(offeringId: string, newStatus: string) {
    setActing(offeringId)
    await supabase.from('course_offerings').update({ results_status: newStatus }).eq('id', offeringId)
    setActing(null)
    setOfferings(prev => prev.map(o => o.id === offeringId ? { ...o, results_status: newStatus } : o))
  }

  const filterOptions = isExamOfficer
    ? ['all', 'draft', 'submitted', 'verified', 'approved', 'published']
    : isHOD
    ? ['all', 'verified', 'approved', 'published']
    : ['all', 'approved', 'published']

  const displayed = filter === 'all'
    ? offerings
    : offerings.filter(o => o.results_status === filter)

  const awaitingAction = isExamOfficer
    ? offerings.filter(o => o.results_status === 'submitted').length
    : isHOD
    ? offerings.filter(o => o.results_status === 'verified').length
    : 0

  const scopeLabel = scope === undefined
    ? 'Loading…'
    : scope === null
    ? (officeName === 'exam_officer' ? 'Institution-wide' : 'Scope not configured')
    : scope.label

  const roleLabel = isExamOfficer
    ? 'Examinations Officer'
    : isHOD
    ? 'Head of Department'
    : 'Dean'

  return (
    <>
      <Topbar title="Score Review" meta={`${roleLabel} · ${scopeLabel}`} />

      <div className="p-8 space-y-5 max-w-4xl">

        {/* No scope warning */}
        {scope === null && officeName !== 'exam_officer' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
            Your scope (department / faculty) is not configured. Ask an administrator to assign you to the correct office in Coredesk.
          </div>
        )}

        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center min-w-[96px]">
            <div className="text-xl font-bold text-navy-900">{offerings.length}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Offerings</div>
          </div>
          {awaitingAction > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-center min-w-[96px]">
              <div className="text-xl font-bold text-amber-700">{awaitingAction}</div>
              <div className="text-[11px] text-amber-600 mt-0.5">Awaiting Action</div>
            </div>
          )}
          {filterOptions.filter(f => f !== 'all').map(f => {
            const n = offerings.filter(o => o.results_status === f).length
            if (!n) return null
            return (
              <div key={f} className={`rounded-lg px-4 py-3 text-center min-w-[80px] border ${STATUS_STYLE[f] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                <div className="text-xl font-bold">{n}</div>
                <div className="text-[11px] mt-0.5">{STATUS_LABEL[f]}</div>
              </div>
            )
          })}
        </div>

        {/* Filter bar */}
        <div className="flex gap-1.5 flex-wrap">
          {filterOptions.map(f => {
            const n = f === 'all' ? offerings.length : offerings.filter(o => o.results_status === f).length
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded border cursor-pointer transition-colors ${
                  filter === f
                    ? 'bg-navy-900 text-white border-navy-900'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-navy-300 hover:text-navy-700'
                }`}>
                {f === 'all' ? 'All' : STATUS_LABEL[f] ?? f}
                <span className="ml-1.5 opacity-70">{n}</span>
              </button>
            )
          })}
        </div>

        {/* Offerings */}
        {loading ? (
          <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
        ) : displayed.length === 0 ? (
          <Card className="px-5 py-12 text-center">
            <div className="text-sm text-gray-400">
              {filter !== 'all'
                ? `No ${STATUS_LABEL[filter] ?? filter} offerings in your scope.`
                : 'No offerings found for your scope.'}
            </div>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {displayed.map(o => {
              const course  = o.course
              const dep     = course?.department
              const sem     = o.semester
              const lec     = o.lecturer?.profile
              const lecName = [lec?.first_name, lec?.last_name].filter(Boolean).join(' ') || '—'
              const busy    = acting === o.id

              const canExamVerify = isExamOfficer && o.results_status === 'submitted'
              const canHODApprove = isHOD         && o.results_status === 'verified'

              return (
                <div key={o.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
                  <div className="flex items-start justify-between gap-4">

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[13px] font-bold text-navy-900 font-mono">{course?.code ?? '—'}</span>
                        <span className="text-[13px] text-gray-700 truncate">{course?.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                        <span>{dep?.name ?? '—'}</span>
                        <span className="text-gray-300">·</span>
                        <span>{sem?.session?.label} · {sem?.label}</span>
                        <span className="text-gray-300">·</span>
                        <span>{lecName}</span>
                      </div>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded ${STATUS_STYLE[o.results_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[o.results_status] ?? o.results_status}
                      </span>

                      {/* Exam officer: verify or reject back to lecturer */}
                      {canExamVerify && (
                        <>
                          <button onClick={() => act(o.id, 'verified')} disabled={!!acting}
                            className="text-[11px] font-semibold px-3 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 cursor-pointer transition-colors">
                            {busy ? '…' : 'Verify'}
                          </button>
                          <button onClick={() => act(o.id, 'draft')} disabled={!!acting}
                            className="text-[11px] font-semibold px-3 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 cursor-pointer transition-colors">
                            {busy ? '…' : 'Reject'}
                          </button>
                        </>
                      )}

                      {/* HOD: approve or send back to exam officer */}
                      {canHODApprove && (
                        <>
                          <button onClick={() => act(o.id, 'approved')} disabled={!!acting}
                            className="text-[11px] font-semibold px-3 py-1 rounded border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 cursor-pointer transition-colors">
                            {busy ? '…' : 'Approve'}
                          </button>
                          <button onClick={() => act(o.id, 'submitted')} disabled={!!acting}
                            className="text-[11px] font-semibold px-3 py-1 rounded border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 cursor-pointer transition-colors">
                            {busy ? '…' : 'Send Back ↩'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
