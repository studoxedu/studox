/**
 * Fix: infinite recursion in students RLS policy.
 *
 * students_lecturer_read queries course_registrations, but course_registrations
 * already has policies that indirectly reference students — causing a cycle.
 *
 * Fix: replace the policy with a SECURITY DEFINER function that fetches student
 * IDs without triggering RLS, breaking the cycle.
 */
const https = require('https')
const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(q) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ query: q })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch { res(d) } }) })
    req.on('error', rej); req.write(body); req.end()
  })
}

async function main() {
  console.log('\n=== Fix RLS infinite recursion on students ===\n')

  // Step 1: Create a SECURITY DEFINER function that fetches student IDs for
  // the current lecturer without triggering any RLS policies on the tables it
  // reads — this is what breaks the recursion cycle.
  const r1 = await sql(`
    CREATE OR REPLACE FUNCTION get_lecturer_student_ids(uid uuid)
    RETURNS SETOF uuid
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $$
      SELECT DISTINCT cr.student_id
      FROM course_registrations cr
      JOIN course_offerings co ON co.id = cr.offering_id
      JOIN memberships m ON m.id = co.lecturer_membership_id
      WHERE m.profile_id = uid
        AND m.is_active = true
        AND cr.student_id IS NOT NULL
    $$;
  `)
  if (r1?.message?.includes('ERROR')) {
    console.error('  ✗ Failed to create function:', r1.message)
    return
  }
  console.log('  ✓ Created get_lecturer_student_ids() SECURITY DEFINER function')

  // Step 2: Drop the old recursive policy and recreate it using the function
  const r2 = await sql(`
    DROP POLICY IF EXISTS students_lecturer_read ON students;

    CREATE POLICY students_lecturer_read ON students
      FOR SELECT USING (
        id IN (SELECT get_lecturer_student_ids(auth.uid()))
      );
  `)
  if (r2?.message?.includes('ERROR')) {
    console.error('  ✗ Failed to recreate policy:', r2.message)
    return
  }
  console.log('  ✓ Recreated students_lecturer_read policy (no recursion)')

  console.log('\nDone. Test by loading a lecturer course scores page.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
