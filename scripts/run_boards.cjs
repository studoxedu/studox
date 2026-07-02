const https = require('https')

const PROJECT = 'fghdgtihpvaehykgqgro'
const PAT     = process.env.SUPABASE_PAT

const SQL = `
-- 1. boards
CREATE TABLE IF NOT EXISTS boards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  board_type     TEXT NOT NULL DEFAULT 'committee'
                   CHECK (board_type IN ('committee','board','task_force','working_group')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. board_members
CREATE TABLE IF NOT EXISTS board_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id),
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('chair','secretary','member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- 3. board_items
CREATE TABLE IF NOT EXISTS board_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  item_type   TEXT NOT NULL DEFAULT 'action'
                CHECK (item_type IN ('agenda','action','note')),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','done','cancelled')),
  assigned_to UUID REFERENCES profiles(id),
  due_date    DATE,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. RLS
ALTER TABLE boards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boards_read   ON boards;
DROP POLICY IF EXISTS boards_write  ON boards;
DROP POLICY IF EXISTS bm_read       ON board_members;
DROP POLICY IF EXISTS bm_write      ON board_members;
DROP POLICY IF EXISTS bm_delete     ON board_members;
DROP POLICY IF EXISTS bi_read       ON board_items;
DROP POLICY IF EXISTS bi_write      ON board_items;
DROP POLICY IF EXISTS bi_update     ON board_items;

-- institution staff can read boards at their school
CREATE POLICY boards_read ON boards FOR SELECT USING (
  institution_id IN (
    SELECT oi.institution_id
    FROM office_assignments oa
    JOIN office_instances oi ON oi.id = oa.office_instance_id
    WHERE oa.profile_id = auth.uid() AND oa.is_active = true
    UNION
    SELECT school_id FROM memberships
    WHERE profile_id = auth.uid() AND is_active = true AND school_id IS NOT NULL
  )
);

-- institution staff can create boards
CREATE POLICY boards_write ON boards FOR INSERT WITH CHECK (
  institution_id IN (
    SELECT oi.institution_id
    FROM office_assignments oa
    JOIN office_instances oi ON oi.id = oa.office_instance_id
    WHERE oa.profile_id = auth.uid() AND oa.is_active = true
    UNION
    SELECT school_id FROM memberships
    WHERE profile_id = auth.uid() AND is_active = true AND school_id IS NOT NULL
  )
);

-- creator can update board (toggle is_active etc.)
CREATE POLICY boards_update ON boards FOR UPDATE USING (created_by = auth.uid());

-- board_members: inherits via board access
CREATE POLICY bm_read ON board_members FOR SELECT USING (
  board_id IN (SELECT id FROM boards)
);
CREATE POLICY bm_write ON board_members FOR INSERT WITH CHECK (
  board_id IN (SELECT id FROM boards)
);
CREATE POLICY bm_delete ON board_members FOR DELETE USING (
  user_id = auth.uid() OR
  board_id IN (SELECT id FROM boards WHERE created_by = auth.uid())
);

-- board_items: readable/writable by institution staff
CREATE POLICY bi_read ON board_items FOR SELECT USING (
  board_id IN (SELECT id FROM boards)
);
CREATE POLICY bi_write ON board_items FOR INSERT WITH CHECK (
  board_id IN (SELECT id FROM boards)
);
CREATE POLICY bi_update ON board_items FOR UPDATE USING (
  board_id IN (SELECT id FROM boards)
);

-- 5. capabilities
INSERT INTO tert_capabilities (code, label) VALUES
  ('board.create', 'Create Boards'),
  ('board.manage', 'Manage Boards')
ON CONFLICT (code) DO NOTHING;

-- 6. map to school_admin office type
INSERT INTO office_type_capabilities (office_type_id, capability_id)
SELECT ot.id, tc.id
FROM office_types ot, tert_capabilities tc
WHERE ot.code = 'school_admin' AND tc.code IN ('board.create','board.manage')
ON CONFLICT DO NOTHING;

SELECT 'boards done' AS status;
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
  console.log('Running boards migration…')
  const result = await query(SQL)
  const last = Array.isArray(result) ? result[result.length - 1] : result
  console.log('Result:', JSON.stringify(last))
}

main().catch(console.error)
