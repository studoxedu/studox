const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PAT         = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9';
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
  console.log('Running Phase 3 migration…\n');

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'phase3.sql'),
    'utf8'
  );

  const result = await runSQL(sql);
  if (result.error || result.message) {
    const msg = result.error || result.message;
    if (msg.includes('already exists')) {
      console.log('Note: Some objects already exist. Continuing…\n');
    } else {
      console.error('Migration error:', msg);
      process.exit(1);
    }
  }

  console.log('Migration applied. Verifying tables…\n');

  const tables = [
    'salary_grades', 'staff_profiles',
    'payroll_runs', 'payroll_entries',
    'library_books', 'library_borrows',
    'announcements',
  ];

  for (const t of tables) {
    const r = await runSQL(`SELECT COUNT(*) AS n FROM ${t}`);
    const n = r[0]?.n ?? r?.error ?? '?';
    const ok = typeof r[0]?.n !== 'undefined' ? '✓' : '✗';
    console.log(`  ${ok} ${t.padEnd(24)} ${n} rows`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
