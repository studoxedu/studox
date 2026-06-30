import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import type { AppUser, K12AcademicSession } from '../../types'

interface Props { appUser: AppUser }

const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' }

export default function K12Calendar({ appUser }: Props) {
  const schoolId = appUser.activeSchool?.id!
  const [sessions, setSessions]   = useState<K12AcademicSession[]>([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Session form
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionLabel, setSessionLabel]       = useState('')
  const [sessionStart, setSessionStart]       = useState('')
  const [sessionEnd, setSessionEnd]           = useState('')
  const [savingSession, setSavingSession]     = useState(false)

  // Term form
  const [termSessionId, setTermSessionId]     = useState<string | null>(null)
  const [termNumber, setTermNumber]           = useState<string>('1')
  const [termStart, setTermStart]             = useState('')
  const [termEnd, setTermEnd]                 = useState('')
  const [savingTerm, setSavingTerm]           = useState(false)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    const { data: sess } = await supabase
      .from('k12_academic_sessions')
      .select('*, terms:k12_terms(*)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
    setSessions((sess ?? []) as K12AcademicSession[])
    setLoading(false)
  }

  useEffect(() => { load() }, [schoolId])

  async function createSession() {
    if (!sessionLabel.trim()) return
    setSavingSession(true)
    const { error } = await supabase.from('k12_academic_sessions').insert({
      school_id: schoolId, label: sessionLabel.trim(),
      start_date: sessionStart || null, end_date: sessionEnd || null,
    })
    setSavingSession(false)
    if (error) { flash(error.message, 'error'); return }
    setSessionLabel(''); setSessionStart(''); setSessionEnd(''); setShowSessionForm(false)
    flash('Session created.'); load()
  }

  async function activateSession(id: string) {
    // Deactivate all, then activate one
    await supabase.from('k12_academic_sessions').update({ is_active: false }).eq('school_id', schoolId)
    await supabase.from('k12_academic_sessions').update({ is_active: true  }).eq('id', id)
    flash('Session activated.'); load()
  }

  async function createTerm() {
    if (!termSessionId) return
    setSavingTerm(true)
    const num = parseInt(termNumber) as 1 | 2 | 3
    const { error } = await supabase.from('k12_terms').insert({
      session_id: termSessionId, school_id: schoolId,
      term_number: num, label: TERM_LABELS[num],
      start_date: termStart || null, end_date: termEnd || null,
    })
    setSavingTerm(false)
    if (error) { flash(error.message, 'error'); return }
    setTermSessionId(null); setTermStart(''); setTermEnd('')
    flash('Term added.'); load()
  }

  async function activateTerm(id: string, sessionId: string) {
    await supabase.from('k12_terms').update({ is_active: false }).eq('school_id', schoolId)
    await supabase.from('k12_terms').update({ is_active: true  }).eq('id', id)
    // Also activate parent session
    await supabase.from('k12_academic_sessions').update({ is_active: false }).eq('school_id', schoolId)
    await supabase.from('k12_academic_sessions').update({ is_active: true  }).eq('id', sessionId)
    flash('Term activated.'); load()
  }

  return (
    <>
      <Topbar title="Academic Calendar" meta={appUser.activeSchool?.name} />
      <div className="p-8 space-y-6">
        {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[18px] font-bold text-navy-900">Academic Calendar</div>
            <div className="text-sm text-gray-400 mt-0.5">Manage sessions and terms</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowSessionForm(v => !v)}>
            + New Session
          </Button>
        </div>

        {showSessionForm && (
          <Card className="p-5">
            <div className="text-sm font-bold text-navy-900 mb-4">New Academic Session</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label mb-1.5 block">Label</label>
                <Input placeholder="e.g. 2025/2026" value={sessionLabel} onChange={e => setSessionLabel(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1.5 block">Start Date</label>
                <Input type="date" value={sessionStart} onChange={e => setSessionStart(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1.5 block">End Date</label>
                <Input type="date" value={sessionEnd} onChange={e => setSessionEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="primary" size="sm" onClick={createSession} disabled={savingSession}>
                {savingSession ? 'Saving…' : 'Create Session'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSessionForm(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
        ) : sessions.length === 0 ? (
          <Card className="py-16 text-center">
            <div className="text-sm font-semibold text-gray-500 mb-1">No sessions yet</div>
            <div className="text-xs text-gray-400">Create your first academic session to get started.</div>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <Card key={session.id}>
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="text-base font-bold text-navy-900">{session.label}</div>
                    {session.is_active && (
                      <span className="text-[10px] font-bold tracking-widest uppercase text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-sm">
                        Active
                      </span>
                    )}
                    {(session.start_date || session.end_date) && (
                      <span className="text-xs text-gray-400">
                        {session.start_date ? formatDate(session.start_date) : '?'} – {session.end_date ? formatDate(session.end_date) : '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!session.is_active && (
                      <Button variant="secondary" size="sm" onClick={() => activateSession(session.id)}>
                        Set Active
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setTermSessionId(session.id)}>
                      + Add Term
                    </Button>
                  </div>
                </div>

                {/* Term form inline */}
                {termSessionId === session.id && (
                  <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                    <div className="text-xs font-bold text-navy-700 mb-3">Add Term to {session.label}</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label mb-1 block">Term</label>
                        <Select value={termNumber} onChange={e => setTermNumber(e.target.value)}
                          options={[{value:'1',label:'First Term'},{value:'2',label:'Second Term'},{value:'3',label:'Third Term'}]} />
                      </div>
                      <div>
                        <label className="label mb-1 block">Start Date</label>
                        <Input type="date" value={termStart} onChange={e => setTermStart(e.target.value)} />
                      </div>
                      <div>
                        <label className="label mb-1 block">End Date</label>
                        <Input type="date" value={termEnd} onChange={e => setTermEnd(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="primary" size="sm" onClick={createTerm} disabled={savingTerm}>
                        {savingTerm ? 'Saving…' : 'Add Term'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTermSessionId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Terms list */}
                <div className="divide-y divide-gray-50">
                  {(session.terms ?? []).length === 0 ? (
                    <div className="px-5 py-4 text-xs text-gray-400">No terms added yet.</div>
                  ) : (
                    [...(session.terms ?? [])].sort((a, b) => a.term_number - b.term_number).map(term => (
                      <div key={term.id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-sm bg-navy-100 text-navy-700 text-[10px] font-bold flex items-center justify-center">
                            {term.term_number}
                          </span>
                          <span className="text-sm font-semibold text-navy-900">{term.label}</span>
                          {term.is_active && (
                            <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                              Current
                            </span>
                          )}
                          {(term.start_date || term.end_date) && (
                            <span className="text-xs text-gray-400">
                              {term.start_date ? formatDate(term.start_date) : '?'} – {term.end_date ? formatDate(term.end_date) : '?'}
                            </span>
                          )}
                        </div>
                        {!term.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => activateTerm(term.id, session.id)}>
                            Set Current
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
