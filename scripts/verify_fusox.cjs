const https = require('https')
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({ raw: data }) } })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const rows = await sql(`SELECT
    (SELECT name FROM schools WHERE code = 'FUSOX') AS school,
    (SELECT COUNT(*) FROM faculties f JOIN schools s ON s.id = f.school_id WHERE s.code = 'FUSOX') AS faculties,
    (SELECT COUNT(*) FROM departments d JOIN faculties f ON f.id = d.faculty_id JOIN schools s ON s.id = f.school_id WHERE s.code = 'FUSOX') AS departments,
    (SELECT COUNT(*) FROM courses c JOIN departments d ON d.id = c.department_id JOIN faculties f ON f.id = d.faculty_id JOIN schools s ON s.id = f.school_id WHERE s.code = 'FUSOX') AS courses,
    (SELECT COUNT(*) FROM course_offerings co JOIN courses c ON c.id = co.course_id JOIN departments d ON d.id = c.department_id JOIN faculties f ON f.id = d.faculty_id JOIN schools s ON s.id = f.school_id WHERE s.code = 'FUSOX') AS offerings,
    (SELECT COUNT(*) FROM students WHERE institution_id = (SELECT id FROM schools WHERE code = 'FUSOX')) AS students,
    (SELECT COUNT(*) FROM memberships WHERE school_id = (SELECT id FROM schools WHERE code = 'FUSOX') AND is_active = true) AS memberships,
    (SELECT COUNT(*) FROM course_registrations cr JOIN course_offerings co ON co.id = cr.offering_id JOIN courses c ON c.id = co.course_id JOIN departments d ON d.id = c.department_id JOIN faculties f ON f.id = d.faculty_id JOIN schools s ON s.id = f.school_id WHERE s.code = 'FUSOX') AS registrations,
    (SELECT COUNT(*) FROM grade_scales WHERE school_id = (SELECT id FROM schools WHERE code = 'FUSOX')) AS grade_scales`)

  console.log('\n=== FUSOX Verification ===')
  if (rows[0]) {
    const r = rows[0]
    console.log(`School:         ${r.school}`)
    console.log(`Faculties:      ${r.faculties}`)
    console.log(`Departments:    ${r.departments}`)
    console.log(`Courses:        ${r.courses}`)
    console.log(`Offerings:      ${r.offerings}`)
    console.log(`Students:       ${r.students}`)
    console.log(`Memberships:    ${r.memberships}`)
    console.log(`Registrations:  ${r.registrations}`)
    console.log(`Grade scales:   ${r.grade_scales}`)
  }

  // Staff breakdown by office
  const offices = await sql(`SELECT o.name, COUNT(*) AS cnt FROM memberships m JOIN offices o ON o.id = m.office_id WHERE m.school_id = (SELECT id FROM schools WHERE code = 'FUSOX') AND m.is_active = true GROUP BY o.name ORDER BY cnt DESC`)
  console.log('\nMemberships by office:')
  for (const o of (offices || [])) console.log(`  ${o.name.padEnd(22)} ${o.cnt}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
