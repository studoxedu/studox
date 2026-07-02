/**
 * Set up course announcements + notification triggers:
 *   - course_announcements table + RLS
 *   - Trigger: notify enrolled students when a material is uploaded
 *   - Trigger: notify enrolled students when an announcement is posted
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
  console.log('\n=== Setup: Announcements + Notification Triggers ===\n')

  // ── 1. course_announcements table ──────────────────────────────────
  await run('Create course_announcements table', `
    CREATE TABLE IF NOT EXISTS course_announcements (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      offering_id              UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
      posted_by_membership_id  UUID REFERENCES memberships(id) ON DELETE SET NULL,
      title                    TEXT NOT NULL,
      body                     TEXT NOT NULL,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  await run('Enable RLS on course_announcements', `
    ALTER TABLE course_announcements ENABLE ROW LEVEL SECURITY;
  `)

  // ── 2. RLS policies ────────────────────────────────────────────────
  await run('Policy: lecturer SELECT announcements', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_announcements' AND policyname='ann_lecturer_read') THEN
        CREATE POLICY ann_lecturer_read ON course_announcements FOR SELECT USING (
          offering_id IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: lecturer INSERT announcements', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_announcements' AND policyname='ann_lecturer_insert') THEN
        CREATE POLICY ann_lecturer_insert ON course_announcements FOR INSERT WITH CHECK (
          offering_id IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: lecturer DELETE own announcements', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_announcements' AND policyname='ann_lecturer_delete') THEN
        CREATE POLICY ann_lecturer_delete ON course_announcements FOR DELETE USING (
          posted_by_membership_id IN (
            SELECT id FROM memberships WHERE profile_id = auth.uid() AND is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: student SELECT announcements (all offerings of enrolled courses)', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_announcements' AND policyname='ann_student_read') THEN
        CREATE POLICY ann_student_read ON course_announcements FOR SELECT USING (
          offering_id IN (SELECT get_student_offering_ids(auth.uid()))
        );
      END IF;
    END $$;
  `)

  // ── 3. Trigger function: notify students on new material ────────────
  await run('Create notify_on_material() trigger function', `
    CREATE OR REPLACE FUNCTION notify_on_material()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_course_code TEXT;
    BEGIN
      SELECT c.code INTO v_course_code
      FROM course_offerings co
      JOIN courses c ON c.id = co.course_id
      WHERE co.id = NEW.offering_id;

      INSERT INTO notifications (profile_id, school_id, title, body, type, link, is_read)
      SELECT
        s.auth_user_id,
        s.institution_id,
        v_course_code || ' — New material: ' || NEW.title,
        NEW.file_name,
        'info',
        '/student/courses',
        false
      FROM course_registrations cr
      JOIN students s ON s.id = cr.student_id
      WHERE cr.offering_id = NEW.offering_id
        AND cr.student_id IS NOT NULL
        AND s.auth_user_id IS NOT NULL;

      RETURN NEW;
    END;
    $$;
  `)

  await run('Create trigger trg_notify_material', `
    DROP TRIGGER IF EXISTS trg_notify_material ON course_materials;
    CREATE TRIGGER trg_notify_material
      AFTER INSERT ON course_materials
      FOR EACH ROW EXECUTE FUNCTION notify_on_material();
  `)

  // ── 4. Trigger function: notify students on new announcement ────────
  await run('Create notify_on_announcement() trigger function', `
    CREATE OR REPLACE FUNCTION notify_on_announcement()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_course_code TEXT;
    BEGIN
      SELECT c.code INTO v_course_code
      FROM course_offerings co
      JOIN courses c ON c.id = co.course_id
      WHERE co.id = NEW.offering_id;

      INSERT INTO notifications (profile_id, school_id, title, body, type, link, is_read)
      SELECT
        s.auth_user_id,
        s.institution_id,
        v_course_code || ' — ' || NEW.title,
        LEFT(NEW.body, 120),
        'info',
        '/student/courses',
        false
      FROM course_registrations cr
      JOIN students s ON s.id = cr.student_id
      WHERE cr.offering_id = NEW.offering_id
        AND cr.student_id IS NOT NULL
        AND s.auth_user_id IS NOT NULL;

      RETURN NEW;
    END;
    $$;
  `)

  await run('Create trigger trg_notify_announcement', `
    DROP TRIGGER IF EXISTS trg_notify_announcement ON course_announcements;
    CREATE TRIGGER trg_notify_announcement
      AFTER INSERT ON course_announcements
      FOR EACH ROW EXECUTE FUNCTION notify_on_announcement();
  `)

  // ── 5. Ensure notifications table has RLS open for authenticated reads ──
  await run('Ensure notifications: authenticated users can read own', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_own_read') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        CREATE POLICY notif_own_read ON notifications FOR SELECT USING (profile_id = auth.uid());
        CREATE POLICY notif_own_update ON notifications FOR UPDATE USING (profile_id = auth.uid());
      END IF;
    END $$;
  `)

  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
