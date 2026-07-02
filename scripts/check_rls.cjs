const https = require('https')
const PROJECT = 'fghdgtihpvaehykgqgro'
const PAT     = process.env.SUPABASE_PAT

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve(data) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  const queries = [
    ['Policies all', `SELECT tablename, policyname, cmd, qual FROM pg_policies ORDER BY tablename, policyname`],
    ['Schools simple', `SELECT id, name, is_active FROM schools LIMIT 5`],
    ['Profiles email', `SELECT id, email, global_role FROM profiles LIMIT 5`],
    ['Offices simple', `SELECT id, name, governance_mode FROM offices`],
  ]

  for (const [label, sql] of queries) {
    const result = await query(sql)
    console.log(`\n=== ${label} ===`)
    if (Array.isArray(result)) result.forEach(r => console.log(JSON.stringify(r)))
    else console.log(JSON.stringify(result))
  }
}
main().catch(console.error)
