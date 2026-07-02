const https = require('https')
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'fghdgtihpvaehykgqgro'
const FUSOX_ID = '7fe07e1c-1684-47c2-9c0f-656e34fbc9e4'

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
  const types = await sql('SELECT id, code, label FROM office_types ORDER BY code')
  console.log('\noffice_types:')
  for (const t of (types ?? [])) console.log(` ${t.code.padEnd(30)} ${t.id}`)

  const inst = await sql(`SELECT oi.id, oi.label, ot.code FROM office_instances oi JOIN office_types ot ON ot.id = oi.office_type_id WHERE oi.institution_id = '${FUSOX_ID}'`)
  console.log(`\noffice_instances for FUSOX (${(inst ?? []).length} rows):`)
  for (const i of (inst ?? [])) console.log(` ${(i.code ?? '').padEnd(30)} ${i.label ?? '(no label)'}`)

  const caps = await sql('SELECT ot.code, COUNT(otc.id) AS cap_count FROM office_types ot LEFT JOIN office_type_capabilities otc ON otc.office_type_id = ot.id GROUP BY ot.code ORDER BY ot.code')
  console.log('\ncapabilities per office_type:')
  for (const c of (caps ?? [])) console.log(` ${c.code.padEnd(30)} ${c.cap_count} caps`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
