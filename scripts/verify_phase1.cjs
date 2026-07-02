const https = require('https');

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
        'Authorization':  `Bearer ${PAT}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Verifying Phase 1 tables…\n');

  const tables = [
    'k12_academic_sessions', 'k12_terms', 'k12_classes', 'k12_subjects',
    'attendance_records',
    'fee_categories', 'fee_structures', 'fee_invoices', 'fee_payments',
    'guardians', 'guardian_links',
  ];

  for (const t of tables) {
    const r = await runSQL(`SELECT COUNT(*) AS n FROM ${t}`);
    const n = r[0]?.n ?? r?.error ?? JSON.stringify(r).slice(0, 80);
    const ok = typeof r[0]?.n !== 'undefined' ? '✓' : '✗';
    console.log(`  ${ok} ${t.padEnd(28)} ${n} rows`);
  }

  const cols = await runSQL(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'learner_enrollments' AND column_name = 'class_id'`
  );
  console.log(`\n  ${cols.length > 0 ? '✓' : '✗'} class_id column on learner_enrollments: ${cols.length > 0 ? 'present' : 'MISSING'}`);

  const caps = await runSQL('SELECT COUNT(*) AS n FROM capabilities');
  console.log(`  ✓ capabilities total: ${caps[0]?.n}`);

  console.log('\nDone.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
