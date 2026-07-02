const https = require('https');
const PAT = process.env.SUPABASE_PAT;
const P   = 'fghdgtihpvaehykgqgro';

function q(sql) {
  return new Promise((res, rej) => {
    const b = JSON.stringify({ query: sql });
    const r = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${P}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); });
    r.on('error', rej); r.write(b); r.end();
  });
}

async function main() {
  const res = await q(`ALTER TABLE courses ALTER COLUMN user_id DROP NOT NULL`);
  console.log('Drop NOT NULL on user_id:', JSON.stringify(res));

  // Also name is NOT NULL — make nullable for tertiary courses
  const res2 = await q(`ALTER TABLE courses ALTER COLUMN name DROP NOT NULL`);
  console.log('Drop NOT NULL on name:', JSON.stringify(res2));
}
main().catch(e => console.error(e.message));
