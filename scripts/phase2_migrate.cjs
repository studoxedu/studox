const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PAT         = process.env.SUPABASE_PAT;
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req  = https.request({
      hostname: 'api.supabase.com',
      path:     `/v1/projects/${PROJECT_REF}/database/query`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Running Phase 2 migration…\n');

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'phase2.sql'),
    'utf8'
  );

  const result = await runSQL(sql);
  if (result.error || result.message) {
    const msg = result.error || result.message;
    // policies already existing is fine (idempotent re-run)
    if (msg.includes('already exists')) {
      console.log('Note: Some objects already exist (idempotent). Continuing...\n');
    } else {
      console.error('Migration error:', msg);
      process.exit(1);
    }
  }

  console.log('Migration applied. Verifying new tables…\n');

  const tables = ['k12_timetable_periods', 'k12_timetable_slots', 'notifications'];
  for (const t of tables) {
    const r = await runSQL(`SELECT COUNT(*) AS n FROM ${t}`);
    const n = r[0]?.n ?? r?.error ?? '?';
    const ok = typeof r[0]?.n !== 'undefined' ? '✓' : '✗';
    console.log(`  ${ok} ${t.padEnd(28)} ${n} rows`);
  }

  const caps = await runSQL('SELECT COUNT(*) AS n FROM capabilities');
  console.log(`\n  capabilities total: ${caps[0]?.n}`);

  console.log('\nDone.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
