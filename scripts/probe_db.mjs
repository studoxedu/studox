const { Client } = require('pg');
const fs = require('fs');

async function run() {
  // Try multiple pooler regions
  const hosts = [
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-eu-west-1.pooler.supabase.com',
    'aws-0-ap-southeast-1.pooler.supabase.com',
    'aws-0-us-west-1.pooler.supabase.com',
  ];
  
  for (const host of hosts) {
    const client = new Client({
      host,
      port: 5432,
      user: 'postgres.fghdgtihpvaehykgqgro',
      password: 'Studox2026!',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      process.stdout.write(`Trying ${host}... `);
      await client.connect();
      const res = await client.query('SELECT version()');
      console.log('CONNECTED:', res.rows[0].version.split(' ')[0], res.rows[0].version.split(' ')[1]);
      await client.end();
      console.log('REGION:' + host);
      return;
    } catch(e) {
      console.log('FAILED: ' + e.message.split('\n')[0]);
    }
  }
}
run();
