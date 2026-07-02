const https = require('https');
const SVC = process.env.SUPABASE_SERVICE_KEY;
const PAT = process.env.SUPABASE_PAT;
const P   = 'fghdgtihpvaehykgqgro';

function storage(path, method, body) {
  return new Promise((res, rej) => {
    const b = JSON.stringify(body);
    const r = https.request({
      hostname: `${P}.supabase.co`,
      path: `/storage/v1${path}`,
      method,
      headers: { 'Authorization': `Bearer ${SVC}`, 'apikey': SVC, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res({ status: x.statusCode, body: JSON.parse(d) }); } catch { res({ status: x.statusCode, body: d }); } }); });
    r.on('error', rej); r.write(b); r.end();
  });
}

function q(sql) {
  return new Promise((res, rej) => {
    const b = JSON.stringify({ query: sql });
    const r = https.request({ hostname: 'api.supabase.com', path: `/v1/projects/${P}/database/query`, method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); });
    r.on('error', rej); r.write(b); r.end();
  });
}

async function main() {
  // Create public avatars bucket via storage REST API
  const r = await storage('/bucket', 'POST', {
    id: 'avatars',
    name: 'avatars',
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  console.log('Create bucket:', r.status, JSON.stringify(r.body).slice(0, 120));

  // RLS policies via SQL
  const policies = [
    `CREATE POLICY IF NOT EXISTS "avatars_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars')`,
    `CREATE POLICY IF NOT EXISTS "avatars_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid())`,
    `CREATE POLICY IF NOT EXISTS "avatars_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid())`,
    `CREATE POLICY IF NOT EXISTS "avatars_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars')`,
  ];
  for (const sql of policies) {
    const pr = await q(sql);
    console.log('Policy:', pr.error ? pr.error.slice(0, 60) : 'OK');
  }
  console.log('\nBucket URL: https://fghdgtihpvaehykgqgro.supabase.co/storage/v1/object/public/avatars/');
}
main().catch(e => console.error(e.message));
