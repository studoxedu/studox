/**
 * Check course_registrations schema and insert enrollments for all FUSOX students.
 */
const https = require('https')

const PAT         = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
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
  // 1. Inspect schema
  console.log('1. course_registrations column constraints:')
  const cols = await sql(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'course_registrations' AND table_schema = 'public' ORDER BY ordinal_position`)
  for (const c of (cols || [])) {
    console.log(`   ${c.column_name.padEnd(20)} nullable=${c.is_nullable}  default=${c.column_default ?? 'none'}`)
  }

  const enrollmentIdNullable = (cols || []).find(c => c.column_name === 'enrollment_id')?.is_nullable === 'YES'
  const studentIdNullable    = (cols || []).find(c => c.column_name === 'student_id')?.is_nullable === 'YES'
  console.log(`\n  enrollment_id nullable: ${enrollmentIdNullable}`)
  console.log(`  student_id nullable:    ${studentIdNullable}`)

  // 2. Load FUSOX school + all students
  const schoolRows = await sql(`SELECT id FROM schools WHERE code = 'FUSOX' LIMIT 1`)
  const SCHOOL_ID = schoolRows[0]?.id
  console.log(`\n2. FUSOX: ${SCHOOL_ID}`)

  const students = await sql(`SELECT id, reg_number, department_id FROM students WHERE institution_id = '${SCHOOL_ID}'`)
  console.log(`   ${students.length} students`)

  // 3. Load departments + offerings map
  const deptRows = await sql(`SELECT id, code FROM departments WHERE code IS NOT NULL`)
  const deptByCode = {}
  for (const d of (deptRows || [])) deptByCode[d.code] = d.id

  // Map dept code → course codes
  const ENROLL_MAP = {
    CS:  ['CSC101','CSC201','MTH101','ENG101'],
    MTH: ['MTH101','MTH201','CSC101','PHY101'],
    PHY: ['PHY101','PHY201','MTH101','CSC101'],
    EEE: ['EEE101','EEE201','MTH101','PHY101'],
    CVE: ['CVE101','CVE201','MTH101','EEE101'],
    ECO: ['ECO101','ECO201','ENG101','SOC101'],
    SOC: ['SOC101','SOC201','ECO101','ENG101'],
    ENG: ['ENG101','ENG201','HIS101','SOC101'],
    HIS: ['HIS101','HIS201','ENG101','SOC101'],
  }

  // Load course code → offering id (first semester, active)
  const offeringRows = await sql(`
    SELECT co.id AS offering_id, c.code AS course_code
    FROM course_offerings co
    JOIN courses c ON c.id = co.course_id
    JOIN departments d ON d.id = c.department_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE f.school_id = '${SCHOOL_ID}'
  `)
  const offeringByCode = {}
  for (const o of (offeringRows || [])) offeringByCode[o.course_code] = o.offering_id
  console.log(`   ${Object.keys(offeringByCode).length} offerings loaded`)

  // Dept code lookup per student
  const deptCodeRows = await sql(`SELECT d.id, d.code FROM departments d JOIN faculties f ON f.id = d.faculty_id WHERE f.school_id = '${SCHOOL_ID}'`)
  const deptCodeById = {}
  for (const d of (deptCodeRows || [])) deptCodeById[d.id] = d.code

  // 4. Insert registrations
  console.log('\n3. Inserting course registrations…')
  let ok = 0, fail = 0
  for (const stu of (students || [])) {
    const deptCode = deptCodeById[stu.department_id]
    const courseCodes = ENROLL_MAP[deptCode] || []
    for (const code of courseCodes) {
      const offId = offeringByCode[code]
      if (!offId) { continue }

      // Build INSERT — include enrollment_id = NULL if column is nullable, skip otherwise
      let insertSql
      if (enrollmentIdNullable) {
        insertSql = `INSERT INTO course_registrations (offering_id, student_id, enrollment_id, ca_score, exam_score)
                     VALUES ('${offId}', '${stu.id}', NULL, NULL, NULL) ON CONFLICT DO NOTHING`
      } else {
        insertSql = `INSERT INTO course_registrations (offering_id, student_id, ca_score, exam_score)
                     VALUES ('${offId}', '${stu.id}', NULL, NULL) ON CONFLICT DO NOTHING`
      }

      const r = await sql(insertSql)
      if (r && r.message && r.message.includes('ERROR')) {
        console.log(`  ✗ ${stu.reg_number} / ${code}: ${r.message.slice(0,120)}`)
        fail++
      } else {
        ok++
      }
    }
  }
  console.log(`  ✓ ${ok} inserted, ${fail} failed`)

  // 5. Sample scores for Ada + Emeka
  console.log('\n4. Setting sample scores…')
  const sampleScores = [
    { reg:'FUSOX/CS/2025/001', code:'CSC101', ca:22, exam:55 },
    { reg:'FUSOX/CS/2025/001', code:'CSC201', ca:24, exam:62 },
    { reg:'FUSOX/CS/2025/001', code:'MTH101', ca:20, exam:50 },
    { reg:'FUSOX/CS/2025/001', code:'ENG101', ca:21, exam:58 },
    { reg:'FUSOX/CS/2025/002', code:'CSC101', ca:18, exam:48 },
    { reg:'FUSOX/CS/2025/002', code:'CSC201', ca:25, exam:70 },
    { reg:'FUSOX/CS/2025/002', code:'MTH101', ca:23, exam:60 },
    { reg:'FUSOX/CS/2025/002', code:'ENG101', ca:19, exam:52 },
  ]
  const stuLookup = {}
  for (const stu of (students || [])) stuLookup[stu.reg_number] = stu.id

  for (const sc of sampleScores) {
    const stuId = stuLookup[sc.reg]
    const offId = offeringByCode[sc.code]
    if (!stuId || !offId) { console.log(`  ! skip ${sc.reg}/${sc.code}`); continue }
    const r = await sql(`UPDATE course_registrations SET ca_score = ${sc.ca}, exam_score = ${sc.exam}
                         WHERE offering_id = '${offId}' AND student_id = '${stuId}'`)
    if (r && r.message && r.message.includes('ERROR')) {
      console.log(`  ✗ ${sc.reg}/${sc.code}: ${r.message.slice(0,120)}`)
    } else {
      console.log(`  ✓ ${sc.reg} · ${sc.code}  CA=${sc.ca} Exam=${sc.exam}`)
    }
  }

  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
