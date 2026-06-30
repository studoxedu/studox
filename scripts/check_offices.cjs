const https = require('https');

const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9';
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const rows = await runSQL(`
    SELECT
      o.name          AS office,
      o.governance_mode,
      o.description,
      COALESCE(
        string_agg(c.action, ', ' ORDER BY c.action),
        '(none — read-only)'
      ) AS capabilities
    FROM offices o
    LEFT JOIN capabilities c ON c.office_id = o.id
    GROUP BY o.id, o.name, o.governance_mode, o.description
    ORDER BY o.governance_mode, o.name
  `);

  console.log('\n=== Offices & Capabilities ===\n');
  let lastMode = '';
  for (const r of rows) {
    if (r.governance_mode !== lastMode) {
      console.log(`── ${r.governance_mode.toUpperCase()} ──`);
      lastMode = r.governance_mode;
    }
    console.log(`  ${r.office.padEnd(16)} ${r.capabilities}`);
  }

  console.log('\n=== Active Memberships (test data) ===\n');
  const memberships = await runSQL(`
    SELECT
      p.email,
      o.name    AS office,
      o.governance_mode,
      s.name    AS school
    FROM memberships m
    JOIN profiles p  ON p.id  = m.profile_id
    JOIN offices  o  ON o.id  = m.office_id
    LEFT JOIN schools s ON s.id = m.school_id
    WHERE m.is_active = true
    ORDER BY p.email, o.governance_mode
  `);
  for (const m of memberships) {
    console.log(`  ${m.email.padEnd(30)} ${m.office.padEnd(16)} @ ${m.school ?? '(group)'}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
