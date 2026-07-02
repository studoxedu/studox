import { useRef, useState } from 'react'
import { Card, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

const BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars`

export default function StudentProfile({ appUser }: Props) {
  const ctx = useStudentContext(appUser)

  const [firstName,  setFirstName]  = useState(appUser.profile.first_name ?? '')
  const [lastName,   setLastName]   = useState(appUser.profile.last_name  ?? '')
  const [avatarUrl,  setAvatarUrl]  = useState(appUser.profile.avatar_url ?? '')
  const [saving,     setSaving]     = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3500)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { flash('File too large (max 5 MB)', false); return }

    setUploading(true)
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${appUser.profile.id}/avatar.${ext}`

    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { flash(upErr.message, false); setUploading(false); return }

    const url = `${BUCKET_URL}/${path}?t=${Date.now()}`
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', appUser.profile.id)
    setUploading(false)
    if (dbErr) { flash(dbErr.message, false); return }

    setAvatarUrl(url)
    // Patch the in-memory profile so the sidebar + home update without a full reload
    appUser.profile.avatar_url = url
    flash('Photo updated.')
  }

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', appUser.profile.id)
    setSaving(false)
    if (error) { flash(error.message, false); return }
    appUser.profile.first_name = firstName
    appUser.profile.last_name  = lastName
    flash('Profile updated.')
  }

  const school = appUser.activeSchool
  const initials = `${(firstName[0] ?? '?').toUpperCase()}${(lastName[0] ?? '').toUpperCase()}`

  return (
    <div className="p-8 space-y-6 max-w-lg">
      <div className="text-xl font-bold text-navy-900">My Profile</div>

      {toast && <Alert type={toast.ok ? 'success' : 'danger'}>{toast.msg}</Alert>}

      {/* Avatar card */}
      <Card className="p-6">
        <div className="flex items-center gap-6">
          {/* Avatar circle */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-navy-800 overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-navy-200">{initials}</span>
              )}
            </div>
            {/* Upload overlay */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-navy-900 border-2 border-white flex items-center justify-center text-white text-xs hover:bg-navy-700 transition-colors"
              title="Change photo"
            >
              {uploading ? '…' : '+'}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={handleFileChange} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-navy-900 truncate">{firstName} {lastName}</div>
            <div className="text-sm text-gray-400 truncate">{appUser.profile.email}</div>
            {ctx.learnerNo && (
              <div className="text-xs font-mono bg-navy-50 text-navy-600 px-2 py-0.5 rounded mt-1 inline-block">
                {ctx.learnerNo}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-2 text-xs text-navy-600 hover:underline block"
            >
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
        </div>
      </Card>

      {/* Enrolment info */}
      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Enrolment Details</div>
        <div className="space-y-2">
          {[
            { label: 'Institution', value: school?.name ?? '—' },
            { label: 'Programme',   value: ctx.stage?.toUpperCase() ?? '—' },
            { label: 'Reg Number',  value: ctx.learnerNo ?? '—' },
            { label: 'Status',      value: 'Active' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-semibold text-navy-900">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Edit name */}
      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Edit Name</div>
        <div className="space-y-3">
          <Field label="First Name">
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last Name">
            <Input value={lastName} onChange={e => setLastName(e.target.value)} />
          </Field>
          <Button variant="primary" size="sm" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
