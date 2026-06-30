/**
 * Seeds:
 *   - dept_exam_officer + faculty_exam_officer offices
 *   - office_instances for every FUSOX department / faculty
 *   - "Academics Board" for FUSOX
 *   - board members: HODs, Deans, Lecturers, Exam Officers
 */
const https = require('https')

const PAT         = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
const PROJECT_REF = 'fghdgtihpvaehykgqgro'
const SCHOOL_ID   = '7fe07e1c-1684-47c2-9c0f-656e34fbc9e4'

function sql(q) {
  return new Promise((res, rej) => {
    const b = JSON.stringify({ query: q })
    const r = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(JSON.parse(d))) })
    r.on('error', rej); r.write(b); r.end()
  })
}

async function main() {
  console.log('\n=== Seed Academics Board & Exam Officer Roles ===\n')

  // ── 1. Add new office roles ──────────────────────────────────────
  console.log('1. Adding dept_exam_officer + faculty_exam_officer offices…')
  const addR = await sql(`
    INSERT INTO offices (name, governance_mode)
    VALUES ('dept_exam_officer', 'tertiary'), ('faculty_exam_officer', 'tertiary')
    ON CONFLICT (name) DO NOTHING
  `)
  if (addR?.message?.includes('ERROR')) { console.error('  ✗', addR.message); process.exit(1) }
  console.log('  ✓ Done')

  // ── 2. Load FUSOX structure ───────────────────────────────────────
  console.log('2. Loading FUSOX structure…')
  const faculties = await sql(`SELECT id, name FROM faculties WHERE school_id = '${SCHOOL_ID}' ORDER BY name`)
  const depts = await sql(`
    SELECT d.id, d.name, d.faculty_id
    FROM departments d JOIN faculties f ON f.id = d.faculty_id
    WHERE f.school_id = '${SCHOOL_ID}' ORDER BY d.name
  `)
  console.log(`  ✓ ${faculties.length} faculties, ${depts.length} departments`)

  // ── 3. Get office IDs ─────────────────────────────────────────────
  const [deoRows, feoRows] = await Promise.all([
    sql(`SELECT id FROM offices WHERE name = 'dept_exam_officer' LIMIT 1`),
    sql(`SELECT id FROM offices WHERE name = 'faculty_exam_officer' LIMIT 1`),
  ])
  const deoId = deoRows[0]?.id
  const feoId = feoRows[0]?.id
  if (!deoId || !feoId) { console.error('  ✗ Could not find new office IDs'); process.exit(1) }

  // ── 4. Office instances — dept_exam_officer ───────────────────────
  console.log('3. Creating dept_exam_officer instances…')
  let created = 0
  for (const d of depts) {
    const ex = await sql(`SELECT id FROM office_instances WHERE school_id='${SCHOOL_ID}' AND office_id='${deoId}' AND department_id='${d.id}' LIMIT 1`)
    if (ex.length) continue
    const safe = d.name.replace(/'/g, "''")
    await sql(`INSERT INTO office_instances (school_id, office_id, label, department_id) VALUES ('${SCHOOL_ID}', '${deoId}', 'Dept. Exams Officer — ${safe}', '${d.id}')`)
    created++
  }
  console.log(`  ✓ ${created} new instances (${depts.length - created} already existed)`)

  // ── 5. Office instances — faculty_exam_officer ────────────────────
  console.log('4. Creating faculty_exam_officer instances…')
  created = 0
  for (const f of faculties) {
    const ex = await sql(`SELECT id FROM office_instances WHERE school_id='${SCHOOL_ID}' AND office_id='${feoId}' AND faculty_id='${f.id}' LIMIT 1`)
    if (ex.length) continue
    const safe = f.name.replace(/'/g, "''")
    await sql(`INSERT INTO office_instances (school_id, office_id, label, faculty_id) VALUES ('${SCHOOL_ID}', '${feoId}', 'Faculty Exams Officer — ${safe}', '${f.id}')`)
    created++
  }
  console.log(`  ✓ ${created} new instances (${faculties.length - created} already existed)`)

  // ── 6. Create Academics Board ─────────────────────────────────────
  console.log('5. Creating Academics Board…')
  const boardCheck = await sql(`SELECT id FROM boards WHERE institution_id='${SCHOOL_ID}' AND name='Academics Board' LIMIT 1`)
  let boardId
  if (boardCheck.length) {
    boardId = boardCheck[0].id
    console.log(`  ✓ Already exists (${boardId})`)
  } else {
    const ins = await sql(`
      INSERT INTO boards (institution_id, name, description, board_type, is_active)
      VALUES (
        '${SCHOOL_ID}',
        'Academics Board',
        'Oversees academic standards, score verification and result ratification across the institution',
        'board',
        true
      )
      RETURNING id
    `)
    if (ins?.message?.includes('ERROR')) { console.error('  ✗', ins.message); process.exit(1) }
    boardId = ins[0]?.id
    console.log(`  ✓ Created (${boardId})`)
  }

  // ── 7. Seed board members ─────────────────────────────────────────
  console.log('6. Adding eligible staff as board members…')
  const members = await sql(`
    SELECT m.profile_id, o.name AS role_name
    FROM memberships m
    JOIN offices o ON o.id = m.office_id
    WHERE m.school_id = '${SCHOOL_ID}'
      AND m.is_active = true
      AND o.name IN ('hod','dean','lecturer','exam_officer','dept_exam_officer','faculty_exam_officer')
  `)
  let added = 0
  for (const m of members) {
    const ex = await sql(`SELECT id FROM board_members WHERE board_id='${boardId}' AND user_id='${m.profile_id}' LIMIT 1`)
    if (ex.length) continue
    await sql(`INSERT INTO board_members (board_id, user_id, role, joined_at) VALUES ('${boardId}', '${m.profile_id}', 'member', now())`)
    added++
  }
  console.log(`  ✓ ${added} members added (${members.length} eligible, ${members.length - added} already members)`)

  // ── Summary ───────────────────────────────────────────────────────
  const finalMembers = await sql(`SELECT COUNT(*) as n FROM board_members WHERE board_id='${boardId}'`)
  console.log('\n=== Done ===')
  console.log(`  Academics Board: ${boardId}`)
  console.log(`  Total board members: ${finalMembers[0]?.n}`)
  console.log(`  New offices: dept_exam_officer, faculty_exam_officer`)
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
