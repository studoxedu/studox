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
  // Wire every student membership → the matching learner_enrollment at same school
  const r2 = await q(`
    UPDATE memberships
    SET learner_id = sub.learner_id
    FROM (
      SELECT m.id AS membership_id, le.learner_id
      FROM memberships m
      JOIN offices o ON o.id = m.office_id
      JOIN learner_enrollments le ON le.school_id = m.school_id
      WHERE o.name = 'student' AND m.learner_id IS NULL
    ) sub
    WHERE memberships.id = sub.membership_id
  `);
  console.log('Linked student memberships:', r2.error ?? 'OK');

  // Verify
  const check = await q(`
    SELECT m.id, p.email, m.learner_id, le.stage, le.status
    FROM memberships m
    JOIN profiles p ON p.id = m.profile_id
    JOIN offices o ON o.id = m.office_id
    LEFT JOIN learner_enrollments le ON le.learner_id = m.learner_id AND le.school_id = m.school_id
    WHERE o.name = 'student'
  `);
  console.log('Student memberships:', JSON.stringify(check, null, 2));
}
main().catch(e => console.error(e.message));
