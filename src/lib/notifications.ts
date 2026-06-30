import { supabase } from './supabase'

export async function notify(
  profileId: string,
  schoolId: string | null,
  title: string,
  options: {
    body?: string
    type?: 'info' | 'success' | 'warning' | 'alert'
    link?: string
  } = {}
) {
  await supabase.from('notifications').insert({
    profile_id: profileId,
    school_id:  schoolId ?? null,
    title,
    body:  options.body ?? null,
    type:  options.type ?? 'info',
    link:  options.link ?? null,
  })
}
