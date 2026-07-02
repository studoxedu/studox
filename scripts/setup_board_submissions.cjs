/**
 * Set up board_submissions table for senate ratification:
 *   - Links a course_offering to a board for formal ratification
 *   - Lecturers submit their scores + note to a board they're assigned to
 *   - Board members ratify or reject
 */
const https = require('https')
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'fghdgtihpvaehykgqgro'

function sql(q) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ query: q })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch { res(d) } }) })
    req.on('error', rej); req.write(body); req.end()
  })
}

async function run(label, query) {
  const r = await sql(query)
  if (r?.message?.includes('ERROR') || r?.error) {
    console.error(`  ✗ ${label}:`, r.message || r.error)
    return false
  }
  console.log(`  ✓ ${label}`)
  return true
}

async function main() {
  console.log('\n=== Setup: Board Submissions (Senate Ratification) ===\n')

  // ── 1. Create table ────────────────────────────────────────────
  await run('Create board_submissions table', `
    CREATE TABLE IF NOT EXISTS board_submissions (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id                    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      offering_id                 UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
      submitted_by_membership_id  UUID REFERENCES memberships(id) ON DELETE SET NULL,
      status                      TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'reviewed', 'ratified', 'rejected')),
      note                        TEXT,
      submitted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(board_id, offering_id)
    );
  `)

  await run('Enable RLS on board_submissions', `
    ALTER TABLE board_submissions ENABLE ROW LEVEL SECURITY;
  `)

  // ── 2. RLS policies ────────────────────────────────────────────

  // Lecturer can submit to boards they are a member of
  await run('Policy: lecturer INSERT board_submissions', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='board_submissions' AND policyname='bs_insert') THEN
        CREATE POLICY bs_insert ON board_submissions FOR INSERT WITH CHECK (
          board_id IN (SELECT board_id FROM board_members WHERE user_id = auth.uid())
        );
      END IF;
    END $$;
  `)

  // Submitter or board member can read submissions
  await run('Policy: read board_submissions', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='board_submissions' AND policyname='bs_read') THEN
        CREATE POLICY bs_read ON board_submissions FOR SELECT USING (
          board_id IN (SELECT board_id FROM board_members WHERE user_id = auth.uid())
          OR submitted_by_membership_id IN (
            SELECT id FROM memberships WHERE profile_id = auth.uid() AND is_active = true
          )
        );
      END IF;
    END $$;
  `)

  // Lecturer can delete their own pending submission (to resubmit with updated note)
  await run('Policy: lecturer DELETE own pending submission', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='board_submissions' AND policyname='bs_delete_own') THEN
        CREATE POLICY bs_delete_own ON board_submissions FOR DELETE USING (
          status = 'pending'
          AND submitted_by_membership_id IN (
            SELECT id FROM memberships WHERE profile_id = auth.uid() AND is_active = true
          )
        );
      END IF;
    END $$;
  `)

  // Board members can update the status (ratify / reject / mark reviewed)
  await run('Policy: board member UPDATE status', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='board_submissions' AND policyname='bs_update_status') THEN
        CREATE POLICY bs_update_status ON board_submissions FOR UPDATE USING (
          board_id IN (SELECT board_id FROM board_members WHERE user_id = auth.uid())
        );
      END IF;
    END $$;
  `)

  console.log('\nDone.\n')
  console.log('Run this once against Supabase to create the board_submissions table.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
