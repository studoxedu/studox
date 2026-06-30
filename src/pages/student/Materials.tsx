import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useStudentContext } from '../../hooks/useStudentContext'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface CourseMaterial {
  id: string
  title: string
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  created_at: string
  offering_id: string
  course_code: string
  course_title: string
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string | null) {
  if (!type) return 'FILE'
  if (type.startsWith('image/')) return 'IMG'
  if (type === 'application/pdf') return 'PDF'
  if (type.includes('word') || type.includes('document')) return 'DOC'
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'XLS'
  if (type.includes('presentation') || type.includes('powerpoint')) return 'PPT'
  if (type.startsWith('video/')) return 'VID'
  if (type.startsWith('audio/')) return 'AUD'
  return 'FILE'
}

export default function StudentMaterials({ appUser }: Props) {
  const ctx = useStudentContext(appUser)

  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [loading,   setLoading]   = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (!ctx.studentId) return
    loadMaterials()
  }, [ctx.studentId])

  async function loadMaterials() {
    // Get all offering IDs the student is registered in
    const { data: regs } = await supabase
      .from('course_registrations')
      .select('offering_id, offering:course_offerings(id, course:courses(code, title))')
      .eq('student_id', ctx.studentId!)

    if (!regs || regs.length === 0) { setLoading(false); return }

    const offeringIds = regs.map((r: any) => r.offering_id).filter(Boolean)
    const offeringMeta: Record<string, { code: string; title: string }> = {}
    for (const r of regs as any[]) {
      if (r.offering_id) {
        offeringMeta[r.offering_id] = {
          code:  r.offering?.course?.code  ?? '—',
          title: r.offering?.course?.title ?? '—',
        }
      }
    }

    const { data: mats } = await supabase
      .from('course_materials')
      .select('id, title, file_name, file_path, file_size, file_type, created_at, offering_id')
      .in('offering_id', offeringIds)
      .order('created_at', { ascending: false })

    setMaterials(
      (mats ?? []).map((m: any) => ({
        ...m,
        course_code:  offeringMeta[m.offering_id]?.code  ?? '—',
        course_title: offeringMeta[m.offering_id]?.title ?? '—',
      }))
    )
    setLoading(false)
  }

  async function handleDownload(mat: CourseMaterial) {
    setDownloading(mat.id)
    const { data } = await supabase.storage
      .from('course-materials')
      .createSignedUrl(mat.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    setDownloading(null)
  }

  // Group by course
  const grouped = materials.reduce<Record<string, { code: string; title: string; items: CourseMaterial[] }>>(
    (acc, m) => {
      const key = m.offering_id
      if (!acc[key]) acc[key] = { code: m.course_code, title: m.course_title, items: [] }
      acc[key].items.push(m)
      return acc
    },
    {}
  )

  if (loading || ctx.loading) {
    return <div className="p-8 text-sm text-gray-400">Loading materials…</div>
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <div className="text-xl font-bold text-navy-900">Course Materials</div>
        <div className="text-sm text-gray-400 mt-0.5">Files shared by your lecturers</div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card className="py-12 text-center">
          <div className="text-sm text-gray-400">No materials uploaded yet.</div>
          <div className="text-xs text-gray-300 mt-1">Materials shared by your lecturers will appear here.</div>
        </Card>
      ) : (
        Object.values(grouped).map(group => (
          <Card key={group.code}>
            <div className="px-5 py-4 border-b border-gray-100">
              <span className="text-[11px] font-bold text-amber-600 tracking-widest uppercase mr-2">{group.code}</span>
              <span className="text-sm font-semibold text-navy-900">{group.title}</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {group.items.map(m => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-[10px] font-bold text-gray-400 flex-shrink-0 w-8 text-center">{fileIcon(m.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-navy-900 truncate">{m.title}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {m.file_name}
                      {m.file_size ? ` · ${fmtSize(m.file_size)}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(m)}
                    disabled={downloading === m.id}
                    className="text-xs text-navy-600 hover:text-navy-900 font-medium px-3 py-1.5 rounded border border-gray-200 hover:border-navy-300 transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    {downloading === m.id ? '…' : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  )
}
