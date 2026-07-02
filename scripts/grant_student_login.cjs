const https = require('https');
const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

function sql(q) {
  return new Promise((res,rej) => {
    const body = JSON.stringify({query:q});
    const req = https.request({hostname:'api.supabase.com',path:`/v1/projects/${PROJECT_REF}/database/query`,method:'POST',headers:{'Authorization':`Bearer ${PAT}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch{res({raw:d})}});
    });
    req.on('error',rej); req.write(body); req.end();
  });
}

async function run() {
  const r = await sql(`
    CREATE OR REPLACE FUNCTION student_email_for_reg(p_reg_number TEXT)
    RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $fn$
      SELECT u.email::TEXT
      FROM students s
      JOIN auth.users u ON u.id = s.auth_user_id
      WHERE LOWER(s.reg_number) = LOWER(p_reg_number) AND s.auth_user_id IS NOT NULL
      LIMIT 1;
    $fn$;
    GRANT EXECUTE ON FUNCTION student_email_for_reg TO anon;
  `);
  if (r && r.error) { console.error('FAIL:', r.error); process.exit(1); }
  console.log('student_email_for_reg + anon grant OK');
}
run().catch(e=>{console.error(e);process.exit(1);});
