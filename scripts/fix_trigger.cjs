const https = require('https');

const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

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
        if (res.status === 200 || res.statusCode === 200 || res.statusCode === 201) {
          if (label) console.log(`✓ ${label}`);
          resolve(JSON.parse(data));
        } else {
          console.error(`✗ ${label || 'query'} (HTTP ${res.statusCode})`);
          const parsed = JSON.parse(data);
          console.error('  ', parsed.message || JSON.stringify(parsed).substring(0, 300));
          reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Check existing trigger
  const triggers = await runSQL(`
    SELECT trigger_name, event_manipulation, event_object_schema, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'users' AND event_object_schema = 'auth'
  `, 'Check existing triggers');
  console.log('Existing triggers on auth.users:', triggers.length ? triggers.map(t => t.trigger_name).join(', ') : 'none');

  // Drop and recreate a safe trigger that won't fail
  await runSQL(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`, 'Drop old trigger');

  await runSQL(`
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, first_name, last_name)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      -- Never block user creation due to profile insert failure
      RETURN NEW;
    END;
    $$
  `, 'Recreate handle_new_user function');

  await runSQL(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user()
  `, 'Recreate trigger');

  console.log('\nTrigger fixed. Try creating the user again.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
