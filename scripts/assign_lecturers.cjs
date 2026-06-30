/**
 * Assign FUSOX lecturers to their course offerings.
 * Also adds RLS so lecturers can update scores for their courses.
 */
const https = require('https')
const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(q) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ query: q })
    const req = https.request({ hostname: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST', headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch { res(d) } }) })
    req.on('error', rej); req.write(body); req.end()
  })
}

async function main() {
  console.log('\n=== Assign FUSOX Lecturers to Course Offerings ===\n')

  // Get FUSOX school ID
  const school = (await sql(`SELECT id FROM schools WHERE code = 'FUSOX' LIMIT 1`))[0]
  if (!school?.id) throw new Error('FUSOX school not found')
  const SCHOOL_ID = school.id

  // Get all lecturer memberships at FUSOX (email → membership_id)
  const lecMems = await sql(`
    SELECT p.email, m.id AS membership_id
    FROM memberships m
    JOIN profiles p ON p.id = m.profile_id
    JOIN offices o ON o.id = m.office_id
    WHERE m.school_id = '${SCHOOL_ID}' AND o.name = 'lecturer' AND m.is_active = true
  `)
  const lecMap = {}
  for (const l of (lecMems || [])) lecMap[l.email] = l.membership_id
  console.log('Lecturers found:', Object.keys(lecMap).join(', '))

  // Get all course offerings at FUSOX (course_code → offering_id)
  const offeringRows = await sql(`
    SELECT co.id, c.code
    FROM course_offerings co
    JOIN courses c ON c.id = co.course_id
    JOIN departments d ON d.id = c.department_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE f.school_id = '${SCHOOL_ID}'
  `)
  const offMap = {}
  for (const o of (offeringRows || [])) offMap[o.code] = o.id
  console.log('Offerings found:', Object.keys(offMap).join(', '), '\n')

  // Assignments: lecturer email → course codes
  const ASSIGNMENTS = [
    { email: 'lec.usman@fusox.edu.ng',    courses: ['CSC101','CSC201'] },
    { email: 'lec.amara@fusox.edu.ng',    courses: ['CSC301','CSC401'] },
    { email: 'lec.dayo@fusox.edu.ng',     courses: ['MTH101','MTH201'] },
    { email: 'lec.kemi@fusox.edu.ng',     courses: ['MTH301'] },
    { email: 'lec.olu@fusox.edu.ng',      courses: ['PHY101','PHY201','PHY301'] },
    { email: 'lec.abubakar@fusox.edu.ng', courses: ['EEE101','EEE201','EEE301'] },
    { email: 'lec.chioma@fusox.edu.ng',   courses: ['CVE101','CVE201','CVE301'] },
    { email: 'lec.felix@fusox.edu.ng',    courses: ['ECO101','ECO201','ECO301'] },
    { email: 'lec.helen@fusox.edu.ng',    courses: ['SOC101','SOC201','ENG101','ENG201'] },
    { email: 'lec.kayode@fusox.edu.ng',   courses: ['HIS101'] },
  ]

  for (const a of ASSIGNMENTS) {
    const memId = lecMap[a.email]
    if (!memId) { console.warn(`  ! No membership for ${a.email}`); continue }
    for (const code of a.courses) {
      const offId = offMap[code]
      if (!offId) { console.warn(`  ! No offering for ${code}`); continue }
      const r = await sql(`UPDATE course_offerings SET lecturer_membership_id = '${memId}' WHERE id = '${offId}'`)
      if (r?.message?.includes('ERROR')) {
        console.log(`  ✗ ${a.email} → ${code}: ${r.message.slice(0,80)}`)
      } else {
        console.log(`  ✓ ${a.email.split('@')[0].padEnd(20)} → ${code}`)
      }
    }
  }

  // ── RLS: allow lecturers to SELECT course_offerings they're assigned to ──
  console.log('\nAdding RLS policies for lecturer access…')

  // course_offerings: lecturer can read their own
  await sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_offerings' AND policyname='co_lecturer_read') THEN
        CREATE POLICY co_lecturer_read ON course_offerings
          FOR SELECT USING (
            lecturer_membership_id IN (
              SELECT id FROM memberships WHERE profile_id = auth.uid() AND is_active = true
            )
          );
      END IF;
    END $$;
  `)
  console.log('  ✓ course_offerings: lecturer can SELECT their offerings')

  // course_registrations: lecturer can UPDATE scores for students in their offerings
  await sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_registrations' AND policyname='cr_lecturer_score') THEN
        CREATE POLICY cr_lecturer_score ON course_registrations
          FOR UPDATE USING (
            offering_id IN (
              SELECT co.id FROM course_offerings co
              JOIN memberships m ON m.id = co.lecturer_membership_id
              WHERE m.profile_id = auth.uid() AND m.is_active = true
            )
          );
      END IF;
    END $$;
  `)
  console.log('  ✓ course_registrations: lecturer can UPDATE scores for their courses')

  // course_registrations: lecturer can SELECT scores for their courses
  await sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_registrations' AND policyname='cr_lecturer_read') THEN
        CREATE POLICY cr_lecturer_read ON course_registrations
          FOR SELECT USING (
            offering_id IN (
              SELECT co.id FROM course_offerings co
              JOIN memberships m ON m.id = co.lecturer_membership_id
              WHERE m.profile_id = auth.uid() AND m.is_active = true
            )
          );
      END IF;
    END $$;
  `)
  console.log('  ✓ course_registrations: lecturer can SELECT scores for their courses')

  // students: lecturer can read students in their courses
  await sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='students' AND policyname='students_lecturer_read') THEN
        CREATE POLICY students_lecturer_read ON students
          FOR SELECT USING (
            id IN (
              SELECT cr.student_id FROM course_registrations cr
              JOIN course_offerings co ON co.id = cr.offering_id
              JOIN memberships m ON m.id = co.lecturer_membership_id
              WHERE m.profile_id = auth.uid() AND m.is_active = true
              AND cr.student_id IS NOT NULL
            )
          );
      END IF;
    END $$;
  `)
  console.log('  ✓ students: lecturer can SELECT students enrolled in their courses')

  // grade_scales: all auth users can read (if not already open)
  const gsRls = (await sql(`SELECT relrowsecurity FROM pg_class WHERE relname = 'grade_scales'`))[0]
  if (gsRls?.relrowsecurity) {
    await sql(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grade_scales' AND policyname='gs_read_all') THEN
          CREATE POLICY gs_read_all ON grade_scales FOR SELECT USING (true);
        END IF;
      END $$;
    `)
    console.log('  ✓ grade_scales: open read for authenticated users')
  } else {
    console.log('  ~ grade_scales: RLS off (no policy needed)')
  }

  console.log('\nDone.')
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
