import { createClient } from '@supabase/supabase-js'
import type { FlowExecuteResult } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in your project credentials.'
  )
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
)

/** The only write path for governance data. */
export async function flowExecute(
  actionType: string,
  schoolId: string,
  payload: Record<string, unknown> = {}
): Promise<FlowExecuteResult> {
  const { data, error } = await supabase.rpc('flow_execute', {
    p_action_type: actionType,
    p_school_id: schoolId,
    p_payload: payload,
  })
  if (error) throw new Error(error.message)
  return data as FlowExecuteResult
}
