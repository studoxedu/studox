import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface Announcement {
  id: string
  title: string
  body: string
  audience: string
  created_at: string
  author_membership?: { profile?: { first_name: string | null; last_name: string | null } }
}

const AUDIENCE_OPTIONS = [
  { value: 'all',      label: 'Everyone' },
  { value: 'staff',    label: 'Staff Only' },
  { value: 'students', label: 'Students Only' },
  { value: 'parents',  label: 'Parents / Guardians' },
]

const AUDIENCE_COLOR: Record<string, string> = {
  all:      'bg-navy-100 text-navy-700',
  staff:    'bg-blue-100 text-blue-700',
  students: 'bg-green-100 text-green-700',
  parents:  'bg-amber-100 text-amber-700',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function Announcements({ appUser }: Props) {
  const schoolId    = appUser.activeSchool?.id ?? ''
  const membershipId = appUser.activeMembership?.id ?? ''
  const isStudent   = (appUser.activeMembership?.office?.name ?? '') === 'student'

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [title, setTitle]                 = useState('')
  const [body, setBody]                   = useState('')
  const [audience, setAudience]           = useState('all')
  const [saving, setSaving]               = useState(false)
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [toast, setToast]                 = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    const { data } = await supabase
      .from('announcements')
      .select('*, author_membership:memberships(profile:profiles(first_name, last_name))')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = (data ?? []) as Announcement[]
    setAnnouncements(isStudent ? rows.filter(a => a.audience === 'all' || a.audience === 'students') : rows)
    setLoading(false)
  }

  useEffect(() => { if (schoolId) load() }, [schoolId])

  async function post() {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    const { error } = await supabase.from('announcements').insert({
      school_id:            schoolId,
      title:                title.trim(),
      body:                 body.trim(),
      audience,
      author_membership_id: membershipId || null,
    })
    setSaving(false)
    if (error) { flash(error.message, 'error'); return }
    setTitle(''); setBody(''); setAudience('all'); setShowForm(false)
    flash('Announcement posted.')
    load()
  }

  async function deleteAnnouncement(id: string) {
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    flash('Deleted.')
  }

  return (
    <>
      <Topbar
        title="Announcements"
        meta={appUser.activeSchool?.name}
        actions={!isStudent ? (
          <Button variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Post Announcement'}
          </Button>
        ) : undefined}
      />

      <div className="p-8 max-w-2xl space-y-5">
        {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

        {/* Compose form — staff only */}
        {!isStudent && showForm && (
          <Card className="p-5">
            <div className="text-sm font-bold text-navy-900 mb-4">New Announcement</div>
            <div className="space-y-4">
              <Field label="Title" required>
                <Input autoFocus placeholder="e.g. End of Term Examination Timetable" value={title}
                  onChange={e => setTitle(e.target.value)} />
              </Field>
              <Field label="Audience">
                <Select value={audience} onChange={e => setAudience(e.target.value)}
                  options={AUDIENCE_OPTIONS} />
              </Field>
              <Field label="Message" required>
                <textarea
                  rows={5}
                  placeholder="Type your announcement here…"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-navy-900 resize-none"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="primary" size="sm" onClick={post} disabled={saving || !title || !body}>
                {saving ? 'Posting…' : 'Post'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
        ) : announcements.length === 0 ? (
          <Card className="py-16 text-center">
            <div className="text-sm font-semibold text-gray-500 mb-1">No announcements yet</div>
            <div className="text-xs text-gray-300">Post a notice to share with your institution.</div>
          </Card>
        ) : announcements.map(a => {
          const authorProfile = (a.author_membership as any)?.profile
          const authorName = [authorProfile?.first_name, authorProfile?.last_name].filter(Boolean).join(' ') || 'Unknown'
          const isExpanded = expanded === a.id

          return (
            <Card key={a.id}>
              <button
                className="w-full text-left px-5 py-4 hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : a.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm', AUDIENCE_COLOR[a.audience])}>
                        {AUDIENCE_OPTIONS.find(o => o.value === a.audience)?.label ?? a.audience}
                      </span>
                      <span className="text-[10px] text-gray-400">{timeAgo(a.created_at)}</span>
                    </div>
                    <div className="text-sm font-bold text-navy-900">{a.title}</div>
                    {!isExpanded && (
                      <div className="text-xs text-gray-500 mt-1 truncate">{a.body}</div>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <p className="text-sm text-navy-800 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-xs text-gray-400">
                      Posted by {authorName} · {new Date(a.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {!isStudent && (
                      <button
                        onClick={() => deleteAnnouncement(a.id)}
                        className="text-xs text-red-400 hover:text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
