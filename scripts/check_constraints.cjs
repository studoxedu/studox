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
  // Check constraints on course_registrations
  console.log('1. Check constraints on course_registrations:')
  const r1 = await sql(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'course_registrations' AND c.contype = 'c'
  `)
  console.log(JSON.stringify(r1, null, 2))

  // Check RLS on offices table
  console.log('\n2. RLS on offices table:')
  const r2 = await sql(`
    SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'offices'
  `)
  console.log(JSON.stringify(r2, null, 2))

  // Check office policies
  console.log('\n3. Policies on offices:')
  const r3 = await sql(`
    SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'offices'
  `)
  console.log(JSON.stringify(r3, null, 2))

  // Check memberships policies
  console.log('\n4. Policies on memberships:')
  const r4 = await sql(`
    SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'memberships'
  `)
  console.log(JSON.stringify(r4, null, 2))
}
main().catch(e => { console.error(e.message); process.exit(1) })
