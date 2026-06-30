import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../types'

export interface StudentCtx {
  studentId:    string | null
  regNumber:    string | null
  level:        string | null
  schoolId:     string | null
  firstName:    string
  lastName:     string
  loading:      boolean
  // backward-compat aliases used by existing portal pages
  enrollmentId: string | null  // = studentId
  learnerNo:    string | null  // = regNumber
  stage:        string | null  // = level
}

export function useStudentContext(appUser: AppUser): StudentCtx {
  const firstName = appUser.profile.first_name ?? ''
  const lastName  = appUser.profile.last_name  ?? ''

  const [ctx, setCtx] = useState<StudentCtx>({
    studentId: null, regNumber: null, level: null, schoolId: null,
    firstName, lastName, loading: true,
    enrollmentId: null, learnerNo: null, stage: null,
  })

  useEffect(() => {
    if (!appUser.profile?.id) { setCtx(c => ({ ...c, loading: false })); return }
    supabase
      .from('students')
      .select('id, reg_number, first_name, last_name, institution_id, department_id')
      .eq('auth_user_id', appUser.profile.id)
      .single()
      .then(({ data }) => {
        if (!data) { setCtx(c => ({ ...c, loading: false })); return }
        setCtx({
          studentId:    data.id,
          regNumber:    data.reg_number,
          level:        null,
          schoolId:     data.institution_id,
          firstName:    data.first_name ?? firstName,
          lastName:     data.last_name  ?? lastName,
          loading:      false,
          enrollmentId: data.id,
          learnerNo:    data.reg_number,
          stage:        null,
        })
      })
  }, [appUser.profile?.id])

  return ctx
}
