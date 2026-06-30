import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface Semester {
  id: string
  label: string
  session: { label: string }
}

interface TimetableEntry {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  venue: { name: string } | null
  offering: {
    id: string
    course: { code: string; title: string }
  }
}

interface ExamEntry {
  id: string
  exam_date: string
  start_time: string
  end_time: string
  notes: string | null
  venue: { name: string } | null
  offering: {
    id: string
    course: { code: string; title: string }
  }
}

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StudentTimetable({ appUser }: Props) {
  const ctx     = useStudentContext(appUser)
  const schoolId = appUser.activeSchool?.id ?? ''

  const [tab,        setTab]        = useState<'timetable' | 'exams'>('timetable')
  const [semesters,  setSemesters]  = useState<Semester[]>([])
  const [semesterId, setSemesterId] = useState('')
  const [timetable,  setTimetable]  = useState<TimetableEntry[]>([])
  const [exams,      setExams]      = useState<ExamEntry[]>([])
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!schoolId) return
    supabase.from('semesters')
      .select('id, label, session:academic_sessions!session_id(label)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const s = (data ?? []) as unknown as Semester[]
        setSemesters(s)
        if (s.length) setSemesterId(s[0].id)
      })
  }, [schoolId])

  useEffect(() => {
    if (!semesterId || !ctx.studentId) return
    if (tab === 'timetable') loadTimetable()
    else loadExams()
  }, [semesterId, tab, ctx.studentId])

  async function getRegisteredOfferingIds(): Promise<string[]> {
    // Get all offerings for this semester
    const { data: offs } = await supabase
      .from('course_offerings')
      .select('id')
      .eq('semester_id', semesterId)

    if (!offs?.length) return []
    const semesterOfferingIds = offs.map((o: any) => o.id)

    // Filter to ones the student is actually registered in
    const { data: regs } = await supabase
      .from('course_registrations')
      .select('offering_id')
      .eq('student_id', ctx.studentId!)
      .in('offering_id', semesterOfferingIds)

    return (regs ?? []).map((r: any) => r.offering_id)
  }

  async function loadTimetable() {
    setLoading(true)
    const offeringIds = await getRegisteredOfferingIds()
    if (!offeringIds.length) { setTimetable([]); setLoading(false); return }

    const { data } = await supabase
      .from('timetable_entries')
      .select(`id, day_of_week, start_time, end_time,
        venue:venues!venue_id(name),
        offering:course_offerings!offering_id(
          id,
          course:courses!course_id(code, title)
        )`)
      .in('offering_id', offeringIds)
      .eq('semester_id', semesterId)
      .order('day_of_week')
      .order('start_time')

    setTimetable((data ?? []) as unknown as TimetableEntry[])
    setLoading(false)
  }

  async function loadExams() {
    setLoading(true)
    const offeringIds = await getRegisteredOfferingIds()
    if (!offeringIds.length) { setExams([]); setLoading(false); return }

    const { data } = await supabase
      .from('exam_entries')
      .select(`id, exam_date, start_time, end_time, notes,
        venue:venues!venue_id(name),
        offering:course_offerings!offering_id(
          id,
          course:courses!course_id(code, title)
        )`)
      .in('offering_id', offeringIds)
      .eq('semester_id', semesterId)
      .order('exam_date')
      .order('start_time')

    setExams((data ?? []) as unknown as ExamEntry[])
    setLoading(false)
  }

  // Group class timetable by day
  const byDay: Record<number, TimetableEntry[]> = {}
  timetable.forEach(e => { (byDay[e.day_of_week] ??= []).push(e) })

  if (ctx.loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-xl font-bold text-navy-900">Timetable</div>
        <div className="text-sm text-gray-400 mt-0.5">Your class schedule and exam dates</div>
      </div>

      {/* Tabs + semester picker */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 border-b border-gray-200">
          {(['timetable', 'exams'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-navy-900 text-navy-900' : 'border-transparent text-gray-400 hover:text-navy-700'
              }`}>
              {t === 'timetable' ? 'Class Schedule' : 'Exam Schedule'}
            </button>
          ))}
        </div>
        <select value={semesterId} onChange={e => setSemesterId(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 text-sm text-navy-900 bg-white">
          {semesters.map(s => (
            <option key={s.id} value={s.id}>{s.session?.label} — {s.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : tab === 'timetable' ? (
        timetable.length === 0 ? (
          <Card className="py-12 text-center">
            <div className="text-sm text-gray-400">No timetable entries for your courses this semester.</div>
          </Card>
        ) : (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].filter(d => byDay[d]?.length).map(d => (
              <Card key={d}>
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-bold uppercase tracking-widest text-navy-600">{DAYS[d]}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {byDay[d].map(e => (
                    <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-28 flex-shrink-0 text-xs font-mono text-gray-500">
                        {fmt12(e.start_time)} – {fmt12(e.end_time)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-amber-600 mr-2">{e.offering?.course?.code}</span>
                        <span className="text-sm text-navy-900">{e.offering?.course?.title}</span>
                      </div>
                      {e.venue && (
                        <div className="text-xs text-gray-400 flex-shrink-0">{e.venue.name}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        exams.length === 0 ? (
          <Card className="py-12 text-center">
            <div className="text-sm text-gray-400">No exam schedule published for your courses yet.</div>
          </Card>
        ) : (
          <Card>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Date', 'Time', 'Course', 'Venue', 'Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-widest uppercase text-gray-500 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exams.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-navy-900 whitespace-nowrap">{fmtDate(e.exam_date)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                      {fmt12(e.start_time)} – {fmt12(e.end_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold text-amber-600 mr-2">{e.offering?.course?.code}</span>
                      <span className="text-sm text-navy-900">{e.offering?.course?.title}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{e.venue?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{e.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </div>
  )
}
