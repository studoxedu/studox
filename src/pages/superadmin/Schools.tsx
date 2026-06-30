import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { AppUser } from '../../types'

interface SchoolRow {
  id: string
  name: string
  is_active: boolean
  institution_type: string | null
  stages_offered: string[]
  tier_id: string
  group_id: string | null
  created_at: string
  group_name?: string
}

interface Group { id: string; name: string }

const SCHOOL_PRESETS = [
  { label: 'Secondary School',     stages: ['jss', 'sss'],  institution_type: null          },
  { label: 'Primary School',       stages: ['primary'],     institution_type: null          },
  { label: 'Nursery/Primary',      stages: ['nursery', 'primary'], institution_type: null   },
  { label: 'University',           stages: ['degree'],      institution_type: 'university'  },
  { label: 'Polytechnic (ND/HND)', stages: ['nd', 'hnd'],   institution_type: 'polytechnic' },
  { label: 'College of Education', stages: ['nce'],         institution_type: 'college_of_education' },
  { label: 'Monotechnic',          stages: ['nd'],          institution_type: 'monotechnic' },
]

export default function SuperAdminSchools({ appUser: _ }: { appUser: AppUser }) {
  const [schools,  setSchools]  = useState<SchoolRow[]>([])
  const [groups,   setGroups]   = useState<Group[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newPreset,  setNewPreset]  = useState(0)
  const [newTier,    setNewTier]    = useState<'pilot' | 'standard'>('pilot')
  const [newGroup,   setNewGroup]   = useState('')
  const [saving,     setSaving]     = useState(false)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sch }, { data: grp }] = await Promise.all([
      supabase.from('schools').select('id, name, is_active, institution_type, stages_offered, tier_id, group_id, created_at').order('created_at', { ascending: false }),
      supabase.from('school_groups').select('id, name').order('name'),
    ])
    const grpMap: Record<string, string> = {}
    for (const g of (grp ?? []) as Group[]) grpMap[g.id] = g.name
    setSchools(((sch ?? []) as SchoolRow[]).map(s => ({
      ...s, group_name: s.group_id ? grpMap[s.group_id] : undefined,
    })))
    setGroups((grp ?? []) as Group[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(school: SchoolRow) {
    const { error } = await supabase
      .from('schools').update({ is_active: !school.is_active }).eq('id', school.id)
    if (error) { flash(error.message, false); return }
    flash(`${school.name} ${school.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function createSchool() {
    if (!newName.trim()) return
    setSaving(true)
    const preset = SCHOOL_PRESETS[newPreset]
    const { error } = await supabase.from('schools').insert({
      name:             newName.trim(),
      stages_offered:   preset.stages,
      institution_type: preset.institution_type,
      tier_id:          newTier,
      is_active:        true,
      modules_included: [],
      group_id:         newGroup || null,
    })
    setSaving(false)
    if (error) { flash(error.message, false); return }
    flash('School created.')
    setShowCreate(false); setNewName(''); setNewGroup(''); setNewPreset(0)
    load()
  }

  function typeLabel(s: SchoolRow): string {
    if (s.institution_type) {
      const map: Record<string, string> = {
        university: 'University', polytechnic: 'Polytechnic',
        college_of_education: 'College of Edu.', monotechnic: 'Monotechnic',
      }
      return map[s.institution_type] ?? s.institution_type
    }
    const stages = s.stages_offered ?? []
    if (stages.some(s => ['jss','sss'].includes(s))) return 'Secondary'
    if (stages.includes('primary')) return 'Primary'
    if (stages.includes('nursery')) return 'Nursery'
    return 'K12'
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-[0.18em] mb-1">Super Admin</div>
          <h1 className="text-[20px] font-bold text-navy-900">Schools</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Onboard and manage all institutions on the platform.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-navy-900 text-white text-[12px] font-bold rounded hover:bg-navy-800 cursor-pointer">
          + Onboard School
        </button>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-2 rounded text-[13px] border ${
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">School</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tier</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Group</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-navy-900">{s.name}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">{s.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{typeLabel(s)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      s.tier_id === 'pilot' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {s.tier_id}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-[12px]">
                    {s.group_name ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                        s.is_active
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-[12px]">
                    {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-right">
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create School modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-[16px] font-bold text-navy-900 mb-4">Onboard School</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Institution Name
                </label>
                <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                  placeholder="e.g. Greenfield Polytechnic"
                  onKeyDown={e => e.key === 'Enter' && createSchool()}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-navy-300" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Institution Type
                </label>
                <select value={newPreset} onChange={e => setNewPreset(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-navy-300">
                  {SCHOOL_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.label}</option>
                  ))}
                </select>
                <div className="text-[11px] text-gray-400 mt-1 font-mono">
                  Stages: {SCHOOL_PRESETS[newPreset].stages.join(', ')}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Tier
                </label>
                <select value={newTier} onChange={e => setNewTier(e.target.value as 'pilot' | 'standard')}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-navy-300">
                  <option value="pilot">Pilot</option>
                  <option value="standard">Standard</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  School Group (optional)
                </label>
                <select value={newGroup} onChange={e => setNewGroup(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-navy-300">
                  <option value="">— standalone (no group) —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-[13px] text-gray-600 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={createSchool} disabled={saving || !newName.trim()}
                className="px-4 py-1.5 bg-navy-900 text-white text-[13px] font-semibold rounded cursor-pointer hover:bg-navy-800 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create School'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
