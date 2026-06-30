import { useEffect, useRef, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import type { AppUser, K12Class, LearnerEnrollment, TermResult } from '../../types'

interface Props { appUser: AppUser }

interface ReportData {
  enrollment: LearnerEnrollment
  result: TermResult | null
}

export default function ReportCards({ appUser }: Props) {
  const schoolId   = appUser.activeSchool?.id!
  const schoolName = appUser.activeSchool?.name ?? ''

  const [classes, setClasses]       = useState<K12Class[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [session, setSession]       = useState('')
  const [term, setTerm]             = useState<string>('1')
  const [reports, setReports]       = useState<ReportData[]>([])
  const [selected, setSelected]     = useState<ReportData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [toast, setToast]           = useState<string | null>(null)
  const printRef                    = useRef<HTMLDivElement>(null)

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000) }

  useEffect(() => {
    supabase.from('k12_classes').select('*').eq('school_id', schoolId).order('name')
      .then(({ data }) => setClasses((data ?? []) as K12Class[]))
  }, [schoolId])

  async function loadReports() {
    if (!selectedClass) return
    setLoading(true)
    const { data: enrollments } = await supabase
      .from('learner_enrollments')
      .select('*, learner:learners(*)')
      .eq('school_id', schoolId)
      .eq('class_id', selectedClass)
      .eq('status', 'active')

    const enList = (enrollments ?? []) as LearnerEnrollment[]

    const results = await Promise.all(
      enList.map(en =>
        supabase.from('term_results')
          .select('*')
          .eq('enrollment_id', en.id)
          .eq('school_id', schoolId)
          .eq('academic_session', session || '2024/2025')
          .eq('term', parseInt(term))
          .maybeSingle()
          .then(({ data }) => ({ enrollment: en, result: data as TermResult | null }))
      )
    )

    setReports(results)
    setLoading(false)
    if (results.length === 0) flash('No learners found in this class.')
  }

  function getGrade(total: number): string {
    if (total >= 75) return 'A'
    if (total >= 65) return 'B'
    if (total >= 55) return 'C'
    if (total >= 45) return 'D'
    if (total >= 40) return 'E'
    return 'F'
  }

  function getRemark(total: number): string {
    if (total >= 75) return 'Excellent'
    if (total >= 65) return 'Very Good'
    if (total >= 55) return 'Good'
    if (total >= 45) return 'Average'
    if (total >= 40) return 'Below Average'
    return 'Fail'
  }

  function printCard() {
    if (!printRef.current) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Report Card</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #111; font-size: 12px; }
        h1 { font-size: 18px; text-align: center; margin: 0; }
        h2 { font-size: 14px; text-align: center; margin: 4px 0 16px; color: #555; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 16px; padding: 8px; background: #f5f5f5; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #1e293b; color: white; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 6px 10px; border-bottom: 1px solid #eee; }
        .total { font-weight: bold; }
        .grade { font-weight: bold; text-align: center; }
        .footer { margin-top: 24px; display: flex; justify-content: space-between; }
        .sig { border-top: 1px solid #000; width: 160px; padding-top: 4px; font-size: 10px; color: #555; }
        @media print { body { margin: 0; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  const TERM_NAMES: Record<string, string> = { '1': 'First', '2': 'Second', '3': 'Third' }

  return (
    <>
      <Topbar title="Report Cards" meta={appUser.activeSchool?.name} />
      <div className="p-8 space-y-6">
        {toast && <Alert type="info">{toast}</Alert>}

        <div className="flex gap-4 items-end">
          <div className="w-48">
            <label className="label mb-1.5 block">Class</label>
            <Select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
              options={[{value:'',label:'Select class…'}, ...classes.map(c => ({value:c.id,label:c.name}))]} />
          </div>
          <div className="w-36">
            <label className="label mb-1.5 block">Session</label>
            <input value={session} onChange={e => setSession(e.target.value)} placeholder="2024/2025"
              className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm text-navy-900 focus:outline-none focus:border-navy-500" />
          </div>
          <div className="w-40">
            <label className="label mb-1.5 block">Term</label>
            <Select value={term} onChange={e => setTerm(e.target.value)}
              options={[{value:'1',label:'First Term'},{value:'2',label:'Second Term'},{value:'3',label:'Third Term'}]} />
          </div>
          <Button variant="primary" size="sm" onClick={loadReports} disabled={!selectedClass || loading}>
            {loading ? 'Loading…' : 'Load Reports'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Learner list */}
          <div>
            <div className="label mb-3">Learners ({reports.length})</div>
            <Card>
              <div className="divide-y divide-gray-50">
                {reports.map(r => (
                  <button
                    key={r.enrollment.id}
                    onClick={() => setSelected(r)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selected?.enrollment.id === r.enrollment.id ? 'bg-navy-50' : ''}`}
                  >
                    <div className="text-sm font-semibold text-navy-900">
                      {r.enrollment.learner?.first_name} {r.enrollment.learner?.last_name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-gray-400">{r.enrollment.learner?.learner_id}</span>
                      {r.result ? (
                        <span className="text-[10px] font-bold text-green-600 uppercase">Has Result</span>
                      ) : (
                        <span className="text-[10px] text-gray-300 uppercase">No Result</span>
                      )}
                    </div>
                  </button>
                ))}
                {reports.length === 0 && (
                  <div className="px-4 py-8 text-sm text-gray-400 text-center">Load reports to see learners.</div>
                )}
              </div>
            </Card>
          </div>

          {/* Report card preview */}
          <div className="col-span-2">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="label">Report Card Preview</div>
                  <Button variant="secondary" size="sm" onClick={printCard}>Print / PDF</Button>
                </div>
                <Card className="p-6">
                  <div ref={printRef}>
                    <h1>{schoolName}</h1>
                    <h2>Student Report Card — {TERM_NAMES[term]} Term, {session || '2024/2025'}</h2>

                    <div className="meta" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f5f5f5', marginBottom: '16px', fontSize: '12px' }}>
                      <div>
                        <strong>Name:</strong> {selected.enrollment.learner?.first_name} {selected.enrollment.learner?.last_name}<br />
                        <strong>ID:</strong> {selected.enrollment.learner?.learner_id}
                      </div>
                      <div>
                        <strong>Class:</strong> {classes.find(c => c.id === selectedClass)?.name}<br />
                        <strong>Stage:</strong> {selected.enrollment.stage?.toUpperCase()}
                      </div>
                    </div>

                    {selected.result?.scores && Object.keys(selected.result.scores).length > 0 ? (
                      <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                          <thead>
                            <tr>
                              {['Subject', 'CA (40)', 'Exam (60)', 'Total (100)', 'Grade', 'Remark'].map(h => (
                                <th key={h} style={{ background: '#1e293b', color: 'white', padding: '6px 10px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selected.result.scores).map(([subject, scores]) => {
                              const total = scores.total ?? (scores.ca + scores.exam)
                              return (
                                <tr key={subject}>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{subject}</td>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{scores.ca}</td>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{scores.exam}</td>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{total}</td>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 'bold', textAlign: 'center' }}>{getGrade(total)}</td>
                                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{getRemark(total)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>

                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ borderTop: '1px solid #000', width: '160px', paddingTop: '4px', fontSize: '10px', color: '#555' }}>Class Teacher's Signature</div>
                          <div style={{ borderTop: '1px solid #000', width: '160px', paddingTop: '4px', fontSize: '10px', color: '#555' }}>Head Teacher's Signature</div>
                          <div style={{ borderTop: '1px solid #000', width: '160px', paddingTop: '4px', fontSize: '10px', color: '#555' }}>Date</div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '32px', color: '#999', fontSize: '13px' }}>
                        No result data available for this learner this term.
                      </div>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <Card className="py-24 text-center">
                <div className="text-sm text-gray-400">Select a learner to preview their report card.</div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
