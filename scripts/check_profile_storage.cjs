const https = require('https');
const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9';
const P   = 'fghdgtihpvaehykgqgro';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGRndGlocHZhZWh5a2dxZ3JvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTYzNzk4NywiZXhwIjoyMDk3MjEzOTg3fQ.fdc7RnbFYDgSmnNOentuSq7kHCpMAVTjgIL76OLKoD0';

function q(sql) {
  return new Promise((res, rej) => {
    const b = JSON.stringify({ query: sql });
    const r = https.request({ hostname: 'api.supabase.com', path: `/v1/projects/${P}/database/query`, method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); });
    r.on('error', rej); r.write(b); r.end();
  });
}

function api(path, method = 'GET', body = null) {
  return new Promise((res, rej) => {
    const b = body ? JSON.stringify(body) : '';
    const headers = { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' };
    if (b) headers['Content-Length'] = Buffer.byteLength(b);
    const r = https.request({ hostname: 'api.supabase.com', path: `/v1/projects/${P}${path}`, method, headers },
      x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res({ status: x.statusCode, body: JSON.parse(d) }); } catch { res({ status: x.statusCode, body: d }); } }); });
    r.on('error', rej); if (b) r.write(b); r.end();
  });
}

async function main() {
  // Check profiles columns
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position`);
  console.log('profiles cols:', cols.map(c => c.column_name).join(', '));

  // Check storage buckets
  const buckets = await api('/storage/buckets');
  console.log('storage buckets:', JSON.stringify(buckets.body));

  // Add avatar_url if missing
  if (!cols.find(c => c.column_name === 'avatar_url')) {
    const r = await q(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    console.log('Added avatar_url:', r.error ?? 'OK');
  } else {
    console.log('avatar_url already exists');
  }
}
main().catch(e => console.error(e.message));
