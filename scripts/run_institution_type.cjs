const https = require('https')

const PROJECT = 'fghdgtihpvaehykgqgro'
const PAT     = process.env.SUPABASE_PAT

const SQL = `
-- 1. Add institution_type to schools
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS institution_type TEXT
  CHECK (institution_type IN ('university','polytechnic','college_of_education','monotechnic'));

-- 2. Seed test school as polytechnic
UPDATE schools
  SET institution_type = 'polytechnic'
WHERE id = '00000000-0000-0000-0000-000000000003';

-- 3. Rebuild _flow_institution_configure with institution_type support
CREATE OR REPLACE FUNCTION _flow_institution_configure(
  p_payload        JSONB,
  p_institution_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dept JSONB;
BEGIN
  -- institution code
  IF (p_payload->>'code') IS NOT NULL THEN
    UPDATE schools SET code = p_payload->>'code'
    WHERE id = p_institution_id;
  END IF;

  -- reg number pattern
  IF (p_payload->>'reg_number_pattern') IS NOT NULL THEN
    UPDATE schools SET reg_number_pattern = p_payload->>'reg_number_pattern'
    WHERE id = p_institution_id;
  END IF;

  -- institution type
  IF (p_payload->>'institution_type') IS NOT NULL THEN
    UPDATE schools SET institution_type = p_payload->>'institution_type'
    WHERE id = p_institution_id;
  END IF;

  -- department codes (array of {id, code})
  IF (p_payload->'department_codes') IS NOT NULL THEN
    FOR v_dept IN
      SELECT value FROM jsonb_array_elements(p_payload->'department_codes')
    LOOP
      UPDATE departments
        SET code = v_dept->>'code'
      WHERE id = (v_dept->>'id')::UUID;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

SELECT 'institution_type done' AS status;
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
  console.log('Running institution_type migration…')
  const result = await query(SQL)
  if (Array.isArray(result)) {
    const last = result[result.length - 1]
    console.log('Result:', JSON.stringify(last))
  } else {
    console.log('Response:', JSON.stringify(result))
  }
}

main().catch(console.error)
