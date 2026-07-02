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
  console.log('Making enrollment_id nullable...')
  const r = await sql('ALTER TABLE course_registrations ALTER COLUMN enrollment_id DROP NOT NULL')
  console.log(JSON.stringify(r))
}
main().catch(e => { console.error(e.message); process.exit(1) })
