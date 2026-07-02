const https = require('https');
const PAT = process.env.SUPABASE_PAT;
const P   = 'fghdgtihpvaehykgqgro';
function q(sql) {
  return new Promise((res, rej) => {
    const b = JSON.stringify({ query: sql });
    const r = https.request({
      hostname: 'api.supabase.com', path: `/v1/projects/${P}/database/query`, method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); });
    r.on('error', rej); r.write(b); r.end();
  });
}
async function main() {
  const cols = await q(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='learners' ORDER BY ordinal_position`);
  console.log('learners nullable:');
  cols.forEach(c => console.log(`  ${c.column_name}: nullable=${c.is_nullable} default=${c.column_default}`));

  const res = await q(`INSERT INTO learners (learner_id, first_name, last_name, date_of_birth) VALUES ('STX-TEST-001', 'Test', 'User', '2000-01-01') RETURNING id`);
  console.log('test insert:', JSON.stringify(res));
  if (res[0]?.id) { await q(`DELETE FROM learners WHERE learner_id = 'STX-TEST-001'`); console.log('cleaned up'); }
}
main().catch(e => console.error(e.message));
