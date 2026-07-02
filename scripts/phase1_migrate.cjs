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
  console.log('Running Phase 1 migration…\n');

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'phase1.sql'),
    'utf8'
  );

  const result = await runSQL(sql);
  if (result.error || result.message) {
    console.error('Migration error:', result.error || result.message);
    process.exit(1);
  }

  console.log('Migration applied. Verifying new tables…\n');

  const tables = [
    'k12_academic_sessions','k12_terms','k12_classes','k12_subjects',
    'attendance_records',
    'fee_categories','fee_structures','fee_invoices','fee_payments',
    'guardians','guardian_links',
  ];

  for (const t of tables) {
    const r = await runSQL(`SELECT COUNT(*) AS n FROM ${t}`);
    const n = r[0]?.n ?? r?.error ?? '?';
    console.log(`  ${t.padEnd(28)} ${n} rows`);
  }

  const caps = await runSQL(`SELECT COUNT(*) AS n FROM capabilities`);
  console.log(`\n  capabilities total: ${caps[0]?.n}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
