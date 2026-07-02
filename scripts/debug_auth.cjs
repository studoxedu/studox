const https = require('https');

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = 'fghdgtihpvaehykgqgro';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_KEY;

function runSQL(sql, label) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (res.statusCode === 200 || res.statusCode === 201) {
          if (label) console.log(`✓ ${label}`);
          resolve(parsed);
        } else {
          console.error(`✗ ${label || 'query'}: ${parsed.message || JSON.stringify(parsed)}`);
          reject(new Error(parsed.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Check profile
  const profiles = await runSQL(`SELECT id, email, first_name FROM profiles`, 'Profiles');
  console.log('  Profiles:', profiles.length, profiles.map(p => p.email));

  // 2. Check memberships with office join
  const memberships = await runSQL(`
    SELECT m.id, m.profile_id, m.school_id, m.is_active, o.name as office, s.name as school
    FROM memberships m
    JOIN offices o ON o.id = m.office_id
    JOIN schools s ON s.id = m.school_id
  `, 'Memberships');
  console.log('  Memberships:', memberships.length, memberships.map(m => `${m.office}@${m.school}`));

  // 3. Check RLS policies
  const policies = await runSQL(`
    SELECT tablename, policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `, 'RLS policies');
  console.log('\n  RLS Policies:');
  policies.forEach(p => console.log(`    ${p.tablename}.${p.policyname} (${p.cmd})`));

  // 4. Verify school is readable via RLS for the user
  const userId = profiles[0]?.id;
  if (userId) {
    const rlsCheck = await runSQL(`
      SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
      SET role authenticated;
      SELECT id, name FROM schools;
    `, 'Schools via RLS simulation');
    console.log('\n  Schools visible:', rlsCheck);
  }

  // 5. Check if schools have RLS enabled
  const rlsEnabled = await runSQL(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `, 'RLS enabled per table');
  console.log('\n  RLS enabled:');
  rlsEnabled.forEach(t => console.log(`    ${t.tablename}: ${t.rowsecurity}`));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
