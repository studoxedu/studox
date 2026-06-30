/**
 * Broaden the student materials policy so students can read materials from
 * ALL semesters of a course they've ever been enrolled in — not just the
 * current offering.
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
  console.log('\n=== Fix: student materials policy (cross-semester) ===\n')

  // Replace get_student_offering_ids to return ALL offerings for any course
  // the student has been registered in (not just the specific offering).
  // This lets students see materials from previous semesters of the same course.
  const r = await sql(`
    CREATE OR REPLACE FUNCTION get_student_offering_ids(uid uuid)
    RETURNS SETOF uuid
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $$
      SELECT DISTINCT co_all.id
      FROM course_offerings co_all
      WHERE co_all.course_id IN (
        SELECT DISTINCT co.course_id
        FROM course_registrations cr
        JOIN course_offerings co ON co.id = cr.offering_id
        JOIN students s ON s.id = cr.student_id
        WHERE s.auth_user_id = uid
      )
    $$;
  `)

  if (r?.message?.includes('ERROR')) {
    console.error('  ✗', r.message); return
  }
  console.log('  ✓ get_student_offering_ids() updated — now covers all semesters of enrolled courses')
  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
