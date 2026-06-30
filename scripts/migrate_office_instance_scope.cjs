/**
 * Adds faculty_id + department_id scope columns to office_instances,
 * then links FUSOX's dean instances to their faculties and
 * HOD instances to their departments.
 */
const https = require('https')
const PAT         = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
const PROJECT_REF = 'fghdgtihpvaehykgqgro'
const FUSOX_ID    = '7fe07e1c-1684-47c2-9c0f-656e34fbc9e4'

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
  console.log('\n=== Migrate office_instances: add scope columns ===\n')

  // ── 1. Add columns ──────────────────────────────────────────────
  await sql(`ALTER TABLE office_instances ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES faculties(id) ON DELETE SET NULL`)
  console.log('  ✓ faculty_id column')

  await sql(`ALTER TABLE office_instances ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL`)
  console.log('  ✓ department_id column')

  // ── 2. Fetch FUSOX faculties ────────────────────────────────────
  const faculties = await sql(`SELECT id, name FROM faculties WHERE school_id = '${FUSOX_ID}' ORDER BY name`)
  console.log(`\nFound ${faculties.length} faculties:`)
  faculties.forEach(f => console.log(`  ${f.id}  ${f.name}`))

  // ── 3. Fetch FUSOX departments ──────────────────────────────────
  const departments = await sql(`
    SELECT d.id, d.name, d.faculty_id, f.name AS faculty_name
    FROM departments d JOIN faculties f ON f.id = d.faculty_id
    WHERE f.school_id = '${FUSOX_ID}' ORDER BY f.name, d.name
  `)
  console.log(`\nFound ${departments.length} departments`)

  // ── 4. Link dean instances to faculties ─────────────────────────
  console.log('\nLinking dean instances → faculties:')
  for (const f of faculties) {
    const label = `Dean — ${f.name}`
    const r = await sql(`
      UPDATE office_instances
      SET faculty_id = '${f.id}'
      WHERE institution_id = '${FUSOX_ID}'
        AND label = '${label.replace(/'/g, "''")}'
        AND faculty_id IS NULL
      RETURNING id, label
    `)
    if (r?.[0]) console.log(`  ✓ ${label}`)
    else        console.log(`  ↳ already set or not found: ${label}`)
  }

  // ── 5. Link HOD instances to departments ────────────────────────
  console.log('\nLinking HOD instances → departments:')
  for (const d of departments) {
    const label = `HOD — ${d.name}`
    const r = await sql(`
      UPDATE office_instances
      SET department_id = '${d.id}'
      WHERE institution_id = '${FUSOX_ID}'
        AND label = '${label.replace(/'/g, "''")}'
        AND department_id IS NULL
      RETURNING id, label
    `)
    if (r?.[0]) console.log(`  ✓ ${label}`)
    else        console.log(`  ↳ already set or not found: ${label}`)
  }

  // ── 6. Verify ───────────────────────────────────────────────────
  const result = await sql(`
    SELECT oi.label,
           f.name  AS faculty,
           d.name  AS department,
           ot.code AS office_type
    FROM office_instances oi
    JOIN office_types ot ON ot.id = oi.office_type_id
    LEFT JOIN faculties f ON f.id = oi.faculty_id
    LEFT JOIN departments d ON d.id = oi.department_id
    WHERE oi.institution_id = '${FUSOX_ID}'
    ORDER BY ot.code, oi.label
  `)

  console.log('\n── Final state ────────────────────────────────────────')
  result.forEach(r => {
    const scope = r.faculty ? `faculty: ${r.faculty}` : r.department ? `dept: ${r.department}` : 'institution-wide'
    console.log(`  [${r.office_type.padEnd(20)}] ${(r.label ?? '').padEnd(50)} ${scope}`)
  })
  console.log('\n✓ Done')
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
