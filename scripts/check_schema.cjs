const https = require('https')
const PROJECT = 'fghdgtihpvaehykgqgro'
const PAT     = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'

const SQL = `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('office_assignments','office_instances','office_types','memberships','offices')
ORDER BY table_name, ordinal_position;
`

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
  const result = await query(SQL)
  if (Array.isArray(result)) {
    result.forEach(r => console.log(`${r.table_name}.${r.column_name} (${r.data_type})`))
  } else {
    console.log(JSON.stringify(result))
  }
}
main().catch(console.error)
