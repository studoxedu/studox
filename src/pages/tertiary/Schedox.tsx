import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { AppUser } from '../../types'

interface Venue {
  id: string
  name: string
  capacity: number | null
  venue_type: string
  is_active: boolean
}

interface TimetableEntry {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  venue: { name: string } | null
  offering: {
    course: { code: string; title: string }
    lecturer_assignment: { profile: { first_name: string; last_name: string } } | null
  }
}

interface ExamEntry {
  id: string
  exam_date: string
  start_time: string
  end_time: string
  notes: string | null
  venue: { name: string } | null
  offering: { course: { code: string; title: string } }
}

interface Semester {
  id: string
  label: string
  session: { label: string }
}

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const VENUE_TYPES = ['classroom', 'lab', 'hall', 'outdoor', 'office']

export default function Schedox({ appUser }: { appUser: AppUser }) {
  const schoolId = appUser.activeSchool?.id
  const [tab, setTab] = useState<'timetable' | 'exams' | 'venues'>('timetable')
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [semesterId, setSemesterId] = useState('')
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [exams, setExams] = useState<ExamEntry[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)

  // Venue modal
  const [venueModal, setVenueModal] = useState(false)
  const [vName, setVName] = useState('')
  const [vCap, setVCap] = useState('')
  const [vType, setVType] = useState('classroom')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    supabase
      .from('semesters')
      .select('id, label, session:academic_sessions!session_id(label)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const s = (data ?? []) as unknown as Semester[]
        setSemesters(s)
        if (s.length) setSemesterId(s[0].id)
      })
    loadVenues()
  }, [schoolId])

  useEffect(() => {
    if (!semesterId) return
    if (tab === 'timetable') loadTimetable()
    if (tab === 'exams') loadExams()
  }, [semesterId, tab])

  function loadVenues() {
    supabase
      .from('venues')
      .select('*')
      .eq('institution_id', schoolId)
      .order('name')
      .then(({ data }) => setVenues((data ?? []) as Venue[]))
  }

  function loadTimetable() {
    setLoading(true)
    supabase
      .from('timetable_entries')
      .select(`id, day_of_week, start_time, end_time,
        venue:venues!venue_id(name),
        offering:course_offerings!offering_id(
          course:courses!course_id(code,title),
          lecturer_assignment:office_assignments!lecturer_assignment_id(profile:profiles!profile_id(first_name,last_name))
        )`)
      .eq('semester_id', semesterId)
      .order('day_of_week')
      .order('start_time')
      .then(({ data }) => { setTimetable((data ?? []) as unknown as TimetableEntry[]); setLoading(false) })
  }

  function loadExams() {
    setLoading(true)
    supabase
      .from('exam_entries')
      .select(`id, exam_date, start_time, end_time, notes,
        venue:venues!venue_id(name),
        offering:course_offerings!offering_id(course:courses!course_id(code,title))`)
      .eq('semester_id', semesterId)
      .order('exam_date')
      .order('start_time')
      .then(({ data }) => { setExams((data ?? []) as unknown as ExamEntry[]); setLoading(false) })
  }

  async function addVenue() {
    if (!vName.trim() || !schoolId) return
    setSaving(true)
    await supabase.from('venues').insert({
      institution_id: schoolId,
      name: vName.trim(),
      capacity: vCap ? parseInt(vCap) : null,
      venue_type: vType,
    })
    setSaving(false)
    setVenueModal(false)
    setVName(''); setVCap(''); setVType('classroom')
    loadVenues()
  }

  async function toggleVenue(v: Venue) {
    await supabase.from('venues').update({ is_active: !v.is_active }).eq('id', v.id)
    loadVenues()
  }

  // Group timetable by day
  const byDay: Record<number, TimetableEntry[]> = {}
  timetable.forEach(e => { (byDay[e.day_of_week] ??= []).push(e) })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-[20px] font-bold text-navy-900 mb-4">Schedox</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['timetable','exams','venues'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium capitalize border-b-2 -mb-px cursor-pointer
              ${tab === t ? 'border-amber-500 text-navy-900' : 'border-transparent text-gray-500 hover:text-navy-900'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Semester selector (timetable + exams tabs) */}
      {tab !== 'venues' && (
        <div className="flex items-center gap-3 mb-5">
          <label className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">Semester</label>
          <select value={semesterId} onChange={e => setSemesterId(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-[13px] text-navy-900 bg-white">
            {semesters.map(s => (
              <option key={s.id} value={s.id}>{s.session?.label} — {s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Timetable */}
      {tab === 'timetable' && (
        <div>
          {loading ? (
            <p className="text-[13px] text-gray-400">Loading…</p>
          ) : timetable.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-[13px]">
              No timetable entries for this semester.
            </div>
          ) : (
            <div className="space-y-4">
              {[1,2,3,4,5].map(d => !byDay[d] ? null : (
                <div key={d}>
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">{DAYS[d]}</div>
                  <div className="space-y-1">
                    {byDay[d].map(e => (
                      <div key={e.id} className="flex items-center gap-4 px-4 py-2.5 bg-white border border-gray-100 rounded-lg">
                        <span className="text-[12px] text-gray-400 w-24 flex-shrink-0">
                          {e.start_time.slice(0,5)} – {e.end_time.slice(0,5)}
                        </span>
                        <span className="text-[13px] font-semibold text-navy-900 flex-1">
                          {e.offering?.course?.code} — {e.offering?.course?.title}
                        </span>
                        {e.venue && <span className="text-[12px] text-gray-500">{e.venue.name}</span>}
                        {e.offering?.lecturer_assignment?.profile && (
                          <span className="text-[12px] text-gray-400">
                            {e.offering.lecturer_assignment.profile.first_name} {e.offering.lecturer_assignment.profile.last_name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exams */}
      {tab === 'exams' && (
        <div>
          {loading ? (
            <p className="text-[13px] text-gray-400">Loading…</p>
          ) : exams.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-[13px]">
              No exam schedule for this semester.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Course</th>
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Venue</th>
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody>
                {exams.map(e => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 text-navy-900">{new Date(e.exam_date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</td>
                    <td className="py-2.5 text-gray-500">{e.start_time.slice(0,5)} – {e.end_time.slice(0,5)}</td>
                    <td className="py-2.5 font-medium text-navy-900">{e.offering?.course?.code} — {e.offering?.course?.title}</td>
                    <td className="py-2.5 text-gray-500">{e.venue?.name ?? '—'}</td>
                    <td className="py-2.5 text-gray-400">{e.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Venues */}
      {tab === 'venues' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setVenueModal(true)}
              className="px-3 py-1.5 bg-amber-500 text-white text-[13px] font-semibold rounded cursor-pointer hover:bg-amber-600">
              + Add Venue
            </button>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Capacity</th>
                <th className="text-left py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {venues.map(v => (
                <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-navy-900">{v.name}</td>
                  <td className="py-2.5 capitalize text-gray-600">{v.venue_type}</td>
                  <td className="py-2.5 text-gray-600">{v.capacity ?? '—'}</td>
                  <td className="py-2.5">
                    <button onClick={() => toggleVenue(v)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer border
                        ${v.is_active ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                                      : 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
              {venues.length === 0 && (
                <tr><td colSpan={4} className="py-10 text-center text-gray-400">No venues yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Venue Modal */}
      {venueModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-[16px] font-bold text-navy-900 mb-4">Add Venue</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Name</label>
                <input value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Lecture Theatre 2"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
                <select value={vType} onChange={e => setVType(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-[13px] capitalize">
                  {VENUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Capacity</label>
                <input value={vCap} onChange={e => setVCap(e.target.value)} placeholder="Optional" type="number"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-[13px]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setVenueModal(false)}
                className="px-3 py-1.5 text-[13px] text-gray-600 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={addVenue} disabled={saving || !vName.trim()}
                className="px-3 py-1.5 bg-amber-500 text-white text-[13px] font-semibold rounded cursor-pointer hover:bg-amber-600 disabled:opacity-50">
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
