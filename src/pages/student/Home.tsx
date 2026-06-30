import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface ActiveSemester {
  id: string
  label: string
  session: { label: string }
}

interface FeeStatus {
  hasPaid: boolean
  hasInvoice: boolean
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

export default function StudentHome({ appUser }: Props) {
  const ctx        = useStudentContext(appUser)
  const schoolId   = appUser.activeSchool?.id ?? ''
  const schoolName = appUser.activeSchool?.name ?? 'Your Institution'

  const [activeSemester, setActiveSemester] = useState<ActiveSemester | null>(null)
  const [feeStatus,      setFeeStatus]      = useState<FeeStatus | null>(null)
  const [courseCount,    setCourseCount]    = useState<number | null>(null)
  const [announcements,  setAnnouncements]  = useState<any[]>([])
  const [avatarUrl,      setAvatarUrl]      = useState(appUser.profile.avatar_url ?? '')

  // Keep avatar fresh
  useEffect(() => {
    const t = setInterval(() => {
      const cur = appUser.profile.avatar_url ?? ''
      if (cur !== avatarUrl) setAvatarUrl(cur)
    }, 1000)
    return () => clearInterval(t)
  }, [avatarUrl, appUser.profile])

  // Active semester
  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('academic_sessions')
      .select('id, semesters:semesters(id, label, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .single()
      .then(({ data: sess }) => {
        if (!sess) return
        const sems = (sess.semesters as any[]).sort((a, b) => b.ordinal - a.ordinal)
        if (!sems.length) return
        const latest = sems[0]
        setActiveSemester({ id: latest.id, label: latest.label, session: { label: (sess as any).label ?? '' } } as any)
      })
  }, [schoolId])

  // Real active semester with session label
  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('semesters')
      .select('id, label, session:academic_sessions!session_id(label)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setActiveSemester(data as unknown as ActiveSemester)
      })
  }, [schoolId])

  // Fee status
  useEffect(() => {
    if (!ctx.studentId) return
    supabase
      .from('fee_invoices')
      .select('id, status')
      .eq('student_id', ctx.studentId)
      .then(({ data }) => {
        const invs = data ?? []
        setFeeStatus({
          hasInvoice: invs.length > 0,
          hasPaid: invs.some(i => i.status === 'paid' || i.status === 'waived'),
        })
      })
  }, [ctx.studentId])

  // Course registrations for active semester
  useEffect(() => {
    if (!ctx.studentId || !activeSemester) return
    supabase
      .from('course_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', ctx.studentId)
      .then(({ count }) => setCourseCount(count ?? 0))
  }, [ctx.studentId, activeSemester?.id])

  // Announcements
  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .eq('school_id', schoolId)
      .in('audience', ['all', 'students'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setAnnouncements(data ?? []))
  }, [schoolId])

  function timeAgo(iso: string) {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (d === 0) return 'Today'
    if (d === 1) return 'Yesterday'
    return `${d}d ago`
  }

  const firstName = ctx.firstName || appUser.profile.first_name || 'Student'
  const lastName  = ctx.lastName  || appUser.profile.last_name  || ''
  const initials  = `${(firstName[0] ?? '').toUpperCase()}${(lastName[0] ?? '').toUpperCase()}`
  const level     = ctx.level?.toUpperCase() ?? '—'
  const regNo     = ctx.regNumber ?? ctx.learnerNo ?? '—'

  const feesDone    = feeStatus?.hasPaid ?? false
  const coursesDone = (courseCount ?? 0) > 0
  const stepsTotal  = 2
  const stepsDone   = (feesDone ? 1 : 0) + (coursesDone ? 1 : 0)

  const steps = [
    {
      key: 'fees',
      label: 'Fees',
      sublabel: feesDone
        ? 'Payment confirmed'
        : feeStatus?.hasInvoice
        ? 'Invoice issued — payment pending'
        : 'No invoice raised yet',
      done: feesDone,
      to: '/student/fees',
    },
    {
      key: 'courses',
      label: 'Course Registration',
      sublabel: coursesDone
        ? `${courseCount} course${courseCount !== 1 ? 's' : ''} registered`
        : 'No courses registered yet',
      done: coursesDone,
      to: '/student/courses',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Semester banner */}
      <div className="bg-navy-900 px-8 py-3 flex items-center gap-2">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-navy-400 flex-shrink-0">
          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        </svg>
        <span className="text-[12px] font-bold text-white uppercase tracking-widest">
          {activeSemester
            ? `${activeSemester.label}, ${(activeSemester.session as any)?.label ?? ''} Session`
            : schoolName}
        </span>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-[320px_1fr] gap-6 items-start">

          {/* ── Left: Profile card ── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Profile */}
            <div className="flex flex-col items-center px-6 py-8 border-b border-gray-100">
              <div className="w-24 h-24 rounded-full bg-navy-100 overflow-hidden flex items-center justify-center mb-4 ring-4 ring-gray-100">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={firstName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-navy-700">{initials}</span>
                )}
              </div>
              <div className="text-[16px] font-bold text-navy-900 text-center">
                {firstName.toUpperCase()} {lastName.toUpperCase()}
              </div>
              <div className="text-[13px] text-gray-500 mt-1 font-mono">{regNo}</div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 text-[12px] text-gray-600">
                <span>Full Time</span>
                <span className="text-gray-300">·</span>
                <span>{level} Level</span>
              </div>
            </div>

            {/* Proceed to Dashboard */}
            <div className="px-6 py-4">
              <Link to="/student/dashboard"
                className="block w-full text-center py-2.5 bg-navy-900 text-white text-[13px] font-semibold rounded-lg hover:bg-navy-800 transition-colors">
                Proceed to Dashboard
              </Link>
            </div>
          </div>

          {/* ── Right: Registration checklist ── */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
              <div className="text-[18px] font-bold text-navy-900 mb-0.5">
                Welcome back, {firstName}
              </div>
              <div className="h-0.5 w-12 bg-amber-500 mb-4" />

              <div className="text-[13px] text-gray-500 mb-1">
                {stepsDone}/{stepsTotal} registration steps completed
              </div>
              {!feesDone && (
                <div className="text-[12px] text-gray-400 mb-4">
                  * Complete fee payment before course registration
                </div>
              )}

              <div className="text-[13px] font-semibold text-navy-900 mb-3">
                Follow the steps to get you started for the new session
              </div>

              {/* Steps */}
              <div className="space-y-2">
                {steps.map(step => (
                  <Link key={step.key} to={step.to}
                    className="flex items-center justify-between px-4 py-3.5 border border-gray-200 rounded-lg hover:border-navy-300 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        step.done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {step.done ? <CheckIcon /> : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-navy-900">{step.label}</div>
                        <div className="text-[11px] text-gray-400">{step.sublabel}</div>
                      </div>
                    </div>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 group-hover:text-navy-600 flex-shrink-0">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>

            {/* Announcements */}
            {announcements.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] font-bold text-navy-900">Announcements</div>
                </div>
                {announcements.map(a => (
                  <div key={a.id} className="px-5 py-3.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-navy-900 truncate">{a.title}</div>
                        {a.body && (
                          <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{a.body}</div>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(a.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
