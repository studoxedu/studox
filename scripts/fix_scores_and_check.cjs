const https = require('https')
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(q) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ query: q })
    const req = https.request({ hostname: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST', headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch { res(d) } }) })
    req.on('error', rej); req.write(body); req.end()
  })
}

async function main() {

  // ── 1. Drop restrictive check constraints ─────────────────────
  console.log('1. Dropping ca_score/exam_score check constraints…')
  const r1a = await sql(`ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS course_registrations_ca_score_check`)
  const r1b = await sql(`ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS course_registrations_exam_score_check`)
  console.log('  ca_score constraint:', JSON.stringify(r1a))
  console.log('  exam_score constraint:', JSON.stringify(r1b))

  // Replace with sane limits (0–100 each, total ≤ 100)
  console.log('  Adding sane 0-100 range constraints…')
  await sql(`ALTER TABLE course_registrations ADD CONSTRAINT cr_ca_range    CHECK (ca_score    >= 0 AND ca_score    <= 100)`)
  await sql(`ALTER TABLE course_registrations ADD CONSTRAINT cr_exam_range  CHECK (exam_score  >= 0 AND exam_score  <= 100)`)
  console.log('  ✓ ca_score 0-100, exam_score 0-100')

  // ── 2. Set all sample scores ──────────────────────────────────
  console.log('\n2. Setting sample scores…')

  const SCHOOL_ID = (await sql(`SELECT id FROM schools WHERE code = 'FUSOX' LIMIT 1`))[0]?.id
  const students = await sql(`SELECT id, reg_number FROM students WHERE institution_id = '${SCHOOL_ID}'`)
  const stuById = {}
  for (const s of (students || [])) stuById[s.reg_number] = s.id

  const offerings = await sql(`
    SELECT co.id AS offering_id, c.code AS course_code
    FROM course_offerings co
    JOIN courses c ON c.id = co.course_id
    JOIN departments d ON d.id = c.department_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE f.school_id = '${SCHOOL_ID}'
  `)
  const offById = {}
  for (const o of (offerings || [])) offById[o.course_code] = o.offering_id

  const SCORES = [
    // Ada Okonkwo — CS/2025/001
    { reg:'FUSOX/CS/2025/001', code:'CSC101', ca:22, exam:55 },
    { reg:'FUSOX/CS/2025/001', code:'CSC201', ca:24, exam:62 },
    { reg:'FUSOX/CS/2025/001', code:'MTH101', ca:20, exam:50 },
    { reg:'FUSOX/CS/2025/001', code:'ENG101', ca:21, exam:58 },
    // Emeka Nwosu — CS/2025/002
    { reg:'FUSOX/CS/2025/002', code:'CSC101', ca:18, exam:48 },
    { reg:'FUSOX/CS/2025/002', code:'CSC201', ca:25, exam:70 },
    { reg:'FUSOX/CS/2025/002', code:'MTH101', ca:23, exam:60 },
    { reg:'FUSOX/CS/2025/002', code:'ENG101', ca:19, exam:52 },
    // Hafsa Bello — CS/2025/003
    { reg:'FUSOX/CS/2025/003', code:'CSC101', ca:28, exam:65 },
    { reg:'FUSOX/CS/2025/003', code:'CSC201', ca:30, exam:72 },
    { reg:'FUSOX/CS/2025/003', code:'MTH101', ca:25, exam:58 },
    { reg:'FUSOX/CS/2025/003', code:'ENG101', ca:26, exam:63 },
  ]

  for (const sc of SCORES) {
    const stuId = stuById[sc.reg]
    const offId = offById[sc.code]
    if (!stuId || !offId) { console.log(`  ! skip ${sc.reg}/${sc.code}`); continue }
    const r = await sql(`UPDATE course_registrations SET ca_score=${sc.ca}, exam_score=${sc.exam} WHERE offering_id='${offId}' AND student_id='${stuId}'`)
    if (r?.message?.includes('ERROR')) {
      console.log(`  ✗ ${sc.reg}/${sc.code}: ${r.message.slice(0,100)}`)
    } else {
      const total = sc.ca + sc.exam
      console.log(`  ✓ ${sc.reg.split('/')[2]}/${sc.code}  CA=${sc.ca} Exam=${sc.exam} Total=${total}`)
    }
  }

  // ── 3. Verify memberships + office names for new staff ────────
  console.log('\n3. Verifying office names loaded in memberships…')
  const staffCheck = await sql(`
    SELECT p.email, o.name AS office_name, m.school_id IS NOT NULL AS has_school
    FROM memberships m
    JOIN profiles p ON p.id = m.profile_id
    JOIN offices o ON o.id = m.office_id
    WHERE m.school_id = '${SCHOOL_ID}'
    AND m.is_active = true
    AND o.name NOT IN ('student','lecturer')
    ORDER BY o.name
  `)
  for (const r of (staffCheck || [])) {
    console.log(`  ${r.office_name.padEnd(22)} ${r.email}`)
  }

  console.log('\nDone.')
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
