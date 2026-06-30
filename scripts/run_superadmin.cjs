const https = require('https')
const PROJECT = 'fghdgtihpvaehykgqgro'
const PAT     = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'

const HAIDAR_ID = 'bd320a14-e86d-47c3-a3a0-44ec9066756c'

const SQL = `
-- 1. Set super_admin for haidarbuilds@gmail.com
UPDATE profiles SET global_role = 'super_admin' WHERE id = '${HAIDAR_ID}';

-- 2. Helper to check super_admin (SECURITY DEFINER avoids circular RLS on profiles)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND global_role = 'super_admin'
  )
$$;
GRANT EXECUTE ON FUNCTION is_super_admin TO authenticated;

-- 3. schools: super admin full read/write
DROP POLICY IF EXISTS schools_super_select ON schools;
DROP POLICY IF EXISTS schools_super_insert ON schools;
DROP POLICY IF EXISTS schools_super_update ON schools;
CREATE POLICY schools_super_select ON schools FOR SELECT USING (is_super_admin());
CREATE POLICY schools_super_insert ON schools FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY schools_super_update ON schools FOR UPDATE USING (is_super_admin());

-- 4. schools: proprietors can read schools in their group
--    (existing schools_members_read only covers school_id memberships, not group_id)
DROP POLICY IF EXISTS schools_proprietor_read ON schools;
CREATE POLICY schools_proprietor_read ON schools FOR SELECT USING (
  group_id IS NOT NULL AND group_id IN (
    SELECT group_id FROM memberships
    WHERE profile_id = auth.uid() AND is_active = true AND group_id IS NOT NULL
  )
);

-- 5. school_groups: enable RLS + policies
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS groups_super         ON school_groups;
DROP POLICY IF EXISTS groups_proprietor    ON school_groups;
CREATE POLICY groups_super ON school_groups
  USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY groups_proprietor ON school_groups FOR SELECT USING (
  id IN (
    SELECT group_id FROM memberships
    WHERE profile_id = auth.uid() AND is_active = true AND group_id IS NOT NULL
  )
);

-- 6. memberships: super admin can read all + insert (to assign proprietors)
DROP POLICY IF EXISTS memberships_super ON memberships;
CREATE POLICY memberships_super ON memberships
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 7. profiles: super admin can read all (for email search / proprietor assignment)
DROP POLICY IF EXISTS profiles_super_read ON profiles;
CREATE POLICY profiles_super_read ON profiles FOR SELECT USING (is_super_admin());

SELECT 'superadmin done' AS status;
`

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve(data) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  console.log('Running super_admin migration…')
  const result = await query(SQL)
  const last = Array.isArray(result) ? result[result.length - 1] : result
  console.log('Result:', JSON.stringify(last))
}
main().catch(console.error)
