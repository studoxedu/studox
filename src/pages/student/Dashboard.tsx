import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser, GradeScale } from '../../types'

interface Props { appUser: AppUser }

interface CourseReg {
  id: string
  ca_score: number | null
  exam_score: number | null
  grade: string | null
  offering?: {
    course?: { code: string; title: string; credit_units: number }
    semester?: { label: string; session?: { label: string } }
  }
}

export default function StudentDashboard({ appUser }: Props) {
  const ctx      = useStudentContext(appUser)
  const schoolId = appUser.activeSchool?.id ?? ''

  const [regs, setRegs]             = useState<CourseReg[]>([])
  const [gradeScales, setGradeScales] = useState<GradeScale[]>([])
  const [feeBalance, setFeeBalance] = useState<{ due: number; paid: number } | null>(null)

  useEffect(() => {
    if (!schoolId) return
    supabase.from('grade_scales').select('*').eq('school_id', schoolId)
      .then(({ data }) => setGradeScales(data ?? []))
  }, [schoolId])

  useEffect(() => {
    if (!ctx.studentId) return
    supabase.from('course_registrations')
      .select('id, ca_score, exam_score, grade, offering:course_offerings(course:courses(code,title,credit_units), semester:semesters(label, session:academic_sessions(label)))')
      .eq('student_id', ctx.studentId)
      .order('created_at')
      .then(({ data }) => setRegs((data ?? []) as CourseReg[]))

    supabase.from('fee_invoices').select('amount_due, amount_paid')
      .eq('student_id', ctx.studentId)
      .then(({ data }) => {
        const due  = (data ?? []).reduce((s, r) => s + (r.amount_due ?? 0), 0)
        const paid = (data ?? []).reduce((s, r) => s + (r.amount_paid ?? 0), 0)
        setFeeBalance({ due, paid })
      })
  }, [ctx.studentId])

  // Compute CGPA
  let totalPoints = 0, totalCU = 0
  for (const r of regs) {
    const cu = r.offering?.course?.credit_units ?? 0
    const scale = gradeScales.find(s => r.grade && s.grade === r.grade)
    if (scale && cu) { totalPoints += scale.grade_point * cu; totalCU += cu }
  }
  const cgpa = totalCU > 0 ? (totalPoints / totalCU).toFixed(2) : null

  const outstanding = feeBalance ? feeBalance.due - feeBalance.paid : null

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <div className="text-xl font-bold text-navy-900">Academic Dashboard</div>
        <div className="text-sm text-gray-400 mt-0.5">{appUser.activeSchool?.name}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Courses',     value: regs.length },
          { label: 'CGPA',        value: cgpa ?? '—' },
          { label: 'Level',       value: ctx.level?.toUpperCase() ?? ctx.stage?.toUpperCase() ?? '—' },
          { label: 'Outstanding', value: outstanding !== null ? `₦${outstanding.toLocaleString()}` : '—' },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{s.label}</div>
            <div className="text-2xl font-bold text-navy-900">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Current courses */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-bold text-navy-900">Registered Courses</div>
          {regs.length > 0 && <div className="text-xs text-gray-400">{regs.length} course{regs.length !== 1 ? 's' : ''}</div>}
        </div>
        {regs.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">No courses registered yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Code', 'Course', 'CU', 'CA', 'Exam', 'Grade'].map(h => (
                  <th key={h} className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold tracking-widest uppercase text-gray-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regs.map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                  <td className="px-4 py-3 text-xs font-mono font-bold text-navy-700">{r.offering?.course?.code ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-navy-900">{r.offering?.course?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.offering?.course?.credit_units ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{r.ca_score ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{r.exam_score ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.grade ? (
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-sm text-sm font-bold ${r.grade === 'A' ? 'bg-green-100 text-green-700' : r.grade === 'F' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.grade}
                      </span>
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
