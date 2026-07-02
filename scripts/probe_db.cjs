const { Client } = require('pg');

async function tryConnect(label, config) {
  const client = new Client({ ...config, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    process.stdout.write(`[${label}] `);
    await client.connect();
    const res = await client.query('SELECT version()');
    console.log('OK: ' + res.rows[0].version.substring(0, 60));
    await client.end();
    return true;
  } catch(e) {
    console.log('FAIL: ' + e.message.split('\n')[0]);
    return false;
  }
}

async function run() {
  const ref = 'fghdgtihpvaehykgqgro';
  const pw  = process.env.SUPABASE_DB_PASSWORD;
  const db  = 'postgres';
  const ipv6 = '2a05:d014:8ef:5901:12b7:d6b9:4c08:309';

  const attempts = [
    // Direct via IPv6 address
    ['ipv6-direct-5432',  { host: ipv6, port: 5432, user: 'postgres', password: pw, database: db }],
    // Pooler - EU regions
    ['eu-west-1-5432',    { host: 'aws-0-eu-west-1.pooler.supabase.com',    port: 5432, user: `postgres.${ref}`, password: pw, database: db }],
    ['eu-west-1-6543',    { host: 'aws-0-eu-west-1.pooler.supabase.com',    port: 6543, user: `postgres.${ref}`, password: pw, database: db }],
    ['eu-west-2-5432',    { host: 'aws-0-eu-west-2.pooler.supabase.com',    port: 5432, user: `postgres.${ref}`, password: pw, database: db }],
    ['eu-central-1-5432', { host: 'aws-0-eu-central-1.pooler.supabase.com', port: 5432, user: `postgres.${ref}`, password: pw, database: db }],
    ['eu-central-1-6543', { host: 'aws-0-eu-central-1.pooler.supabase.com', port: 6543, user: `postgres.${ref}`, password: pw, database: db }],
    // Direct host with postgres.ref username (newer format)
    ['direct-new-user',   { host: `db.${ref}.supabase.co`, port: 5432, user: `postgres.${ref}`, password: pw, database: db }],
  ];

  for (const [label, cfg] of attempts) {
    const ok = await tryConnect(label, cfg);
    if (ok) {
      console.log('\nSUCCESS:', JSON.stringify({ host: cfg.host, port: cfg.port, user: cfg.user }));
      return;
    }
  }
  console.log('\nALL_FAILED');
}
run();
