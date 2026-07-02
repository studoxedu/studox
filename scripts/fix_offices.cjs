/**
 * Insert missing tertiary office types and create memberships for
 * the skipped staff (registrar, finance_officer, senate_secretary,
 * hr_officer, timetable_officer, admissions_officer, library_officer)
 */

const https = require('https')

const PAT         = process.env.SUPABASE_PAT
const PROJECT_REF = 'fghdgtihpvaehykgqgro'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

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

function adminCreateUser(email, password, firstName, lastName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      email, password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })
    const req = https.request({
      hostname: `${PROJECT_REF}.supabase.co`,
      path: '/auth/v1/admin/users',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }) } catch { resolve({ status: res.statusCode, body: data }) } })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getOrCreateUser(email, password, first, last) {
  const res = await adminCreateUser(email, password, first, last)
  if (res.body?.id) {
    await sql(`INSERT INTO profiles (id, email, first_name, last_name)
               VALUES ('${res.body.id}', '${email}', '${first}', '${last}')
               ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`)
    return res.body.id
  }
  const rows = await sql(`SELECT id FROM profiles WHERE email = '${email}' LIMIT 1`)
  if (rows[0]?.id) return rows[0].id
  throw new Error(`Cannot create/find ${email}: ${JSON.stringify(res.body).slice(0,200)}`)
}

async function main() {
  console.log('\n=== Fix: Adding missing tertiary office types ===\n')

  // ── 1. Insert missing offices ──────────────────────────────────
  console.log('1. Inserting missing office rows…')
  const missingOffices = [
    { name: 'registrar',          governance_mode: 'tertiary', description: 'Institution Registrar'         },
    { name: 'finance_officer',    governance_mode: 'tertiary', description: 'Finance / Bursary Officer'     },
    { name: 'senate_secretary',   governance_mode: 'tertiary', description: 'Senate / Academic Board Secretary' },
    { name: 'hr_officer',         governance_mode: 'tertiary', description: 'Human Resources Officer'       },
    { name: 'timetable_officer',  governance_mode: 'tertiary', description: 'Scheduling & Timetable Officer' },
    { name: 'admissions_officer', governance_mode: 'tertiary', description: 'Admissions Office'             },
    { name: 'library_officer',    governance_mode: 'tertiary', description: 'Library Officer'               },
  ]
  for (const o of missingOffices) {
    const r = await sql(`INSERT INTO offices (name, governance_mode, description)
                         VALUES ('${o.name}', '${o.governance_mode}', '${o.description}')
                         ON CONFLICT (name) DO NOTHING
                         RETURNING id`)
    const id = Array.isArray(r) ? r[0]?.id : null
    console.log(`  ${id ? '✓' : '~'} ${o.name}${id ? ': '+id : ' (already existed)'}`)
  }

  // ── 2. Reload office map ───────────────────────────────────────
  console.log('\n2. Reloading office map…')
  const officeRows = await sql(`SELECT id, name FROM offices`)
  const officeMap = {}
  for (const o of (officeRows || [])) officeMap[o.name] = o.id
  console.log(`  ✓ ${Object.keys(officeMap).length} offices total`)

  // ── 3. Get FUSOX school ID ────────────────────────────────────
  const schoolRows = await sql(`SELECT id FROM schools WHERE code = 'FUSOX' LIMIT 1`)
  const SCHOOL_ID = schoolRows[0]?.id
  if (!SCHOOL_ID) throw new Error('FUSOX school not found')
  console.log(`\n3. FUSOX school: ${SCHOOL_ID}`)

  // ── 4. Create missing staff + memberships ─────────────────────
  console.log('\n4. Creating previously skipped staff…')
  const MISSING_STAFF = [
    { email:'registrar@fusox.edu.ng',   pw:'RegFusox2026!',   first:'Chiamaka',  last:'Nwosu',    office:'registrar'          },
    { email:'finance@fusox.edu.ng',     pw:'FinFusox2026!',   first:'Kehinde',   last:'Adebisi',  office:'finance_officer'    },
    { email:'senate@fusox.edu.ng',      pw:'SenFusox2026!',   first:'Yusuf',     last:'Tanko',    office:'senate_secretary'   },
    { email:'hr@fusox.edu.ng',          pw:'HRFusox2026!',    first:'Blessing',  last:'Eze',      office:'hr_officer'         },
    { email:'timetable@fusox.edu.ng',   pw:'TTFusox2026!',    first:'Chidi',     last:'Okoye',    office:'timetable_officer'  },
    { email:'admissions@fusox.edu.ng',  pw:'AdmFusox2026!',   first:'Ada',       last:'Obi',      office:'admissions_officer' },
    { email:'library@fusox.edu.ng',     pw:'LibFusox2026!',   first:'Emeka',     last:'Okoro',    office:'library_officer'    },
  ]

  for (const s of MISSING_STAFF) {
    const officeId = officeMap[s.office]
    if (!officeId) { console.error(`  ✗ Still no office '${s.office}'`); continue }
    const userId = await getOrCreateUser(s.email, s.pw, s.first, s.last)
    await sql(`INSERT INTO memberships (profile_id, school_id, office_id, is_active)
               VALUES ('${userId}', '${SCHOOL_ID}', '${officeId}', true) ON CONFLICT DO NOTHING`)
    console.log(`  ✓ ${s.office}: ${s.email}`)
  }

  console.log('\nDone. All office types and memberships in place.')
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
