const https = require('https');

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_KEY;
const PAT          = process.env.SUPABASE_PAT;
const PROJECT_REF  = 'fghdgtihpvaehykgqgro';
const SCHOOL_ID    = '00000000-0000-0000-0000-000000000002';

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      ...opts,
      headers: { ...opts.headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function runSQL(sql, label) {
  return request({
    hostname: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}` },
  }, { query: sql }).then(r => {
    if (r.status === 200 || r.status === 201) {
      if (label) console.log(`✓ ${label}`);
      return r.body;
    }
    throw new Error(r.body.message || JSON.stringify(r.body));
  });
}

async function main() {
  // 1. Create auth user via Admin API
  console.log('Creating auth user...');
  const authRes = await request({
    hostname: `${PROJECT_REF}.supabase.co`,
    path: '/auth/v1/admin/users',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE}`, 'apikey': SERVICE_ROLE },
  }, {
    email: 'haidarbuilds@gmail.com',
    password: 'haidarbuilds2026!',
    email_confirm: true,
    user_metadata: { first_name: 'Haidar', last_name: 'Builds' },
  });

  if (authRes.status !== 200 && authRes.status !== 201) {
    if (authRes.body.msg?.includes('already been registered') || authRes.body.code === 'email_exists') {
      console.log('  User already exists, fetching...');
    } else {
      throw new Error(`Auth API error ${authRes.status}: ${JSON.stringify(authRes.body)}`);
    }
  }

  let userId = authRes.body.id;

  // If user already existed, fetch their ID
  if (!userId) {
    const listRes = await request({
      hostname: `${PROJECT_REF}.supabase.co`,
      path: '/auth/v1/admin/users?email=haidarbuilds@gmail.com',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE}`, 'apikey': SERVICE_ROLE },
    }, {});
    userId = listRes.body.users?.[0]?.id;
    if (!userId) throw new Error('Could not find user ID');
  }

  console.log(`✓ Auth user: ${userId}`);

  // 2. Ensure profile row exists (trigger should have created it, but just in case)
  await runSQL(`
    INSERT INTO profiles (id, email, first_name, last_name)
    VALUES ('${userId}', 'haidarbuilds@gmail.com', 'Haidar', 'Builds')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  `, 'Profile row');

  // 3. Assign as head_teacher at Greenfield Academy
  await runSQL(`
    INSERT INTO memberships (profile_id, school_id, office_id)
    VALUES (
      '${userId}',
      '${SCHOOL_ID}',
      (SELECT id FROM offices WHERE name = 'head_teacher')
    )
    ON CONFLICT DO NOTHING
  `, 'Membership: head_teacher @ Greenfield Academy');

  // 4. Verify
  const check = await runSQL(`
    SELECT m.id, o.name as office, s.name as school
    FROM memberships m
    JOIN offices o ON o.id = m.office_id
    JOIN schools s ON s.id = m.school_id
    WHERE m.profile_id = '${userId}'
  `, 'Verification');

  console.log('\nUser ready to log in:');
  console.log('  Email   :', 'haidarbuilds@gmail.com');
  console.log('  Password:', 'haidarbuilds2026!');
  console.log('  Office  :', check[0]?.office);
  console.log('  School  :', check[0]?.school);
  console.log('\nOpen http://localhost:5173 and sign in.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
