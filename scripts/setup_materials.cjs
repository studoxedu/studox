/**
 * Set up course materials:
 *   - course_materials table + RLS
 *   - Supabase storage bucket 'course-materials' + storage RLS
 *   - SECURITY DEFINER helper for student offering lookup
 */
const https = require('https')
const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9'
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
  console.log('\n=== Setup: Course Materials ===\n')

  // 1. Table
  await run('Create course_materials table', `
    CREATE TABLE IF NOT EXISTS course_materials (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      offering_id              UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
      uploaded_by_membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
      title                    TEXT NOT NULL,
      file_name                TEXT NOT NULL,
      file_path                TEXT NOT NULL,
      file_size                BIGINT,
      file_type                TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  // 2. RLS on table
  await run('Enable RLS on course_materials', `
    ALTER TABLE course_materials ENABLE ROW LEVEL SECURITY;
  `)

  // 3. SECURITY DEFINER function — student offering IDs (avoids RLS recursion on students)
  await run('Create get_student_offering_ids() function', `
    CREATE OR REPLACE FUNCTION get_student_offering_ids(uid uuid)
    RETURNS SETOF uuid
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $$
      SELECT DISTINCT cr.offering_id
      FROM course_registrations cr
      JOIN students s ON s.id = cr.student_id
      WHERE s.auth_user_id = uid
    $$;
  `)

  // 4. Table RLS policies
  await run('Policy: lecturer can SELECT materials for their offerings', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_materials' AND policyname='mat_lecturer_read') THEN
        CREATE POLICY mat_lecturer_read ON course_materials FOR SELECT USING (
          offering_id IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: lecturer can INSERT materials for their offerings', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_materials' AND policyname='mat_lecturer_insert') THEN
        CREATE POLICY mat_lecturer_insert ON course_materials FOR INSERT WITH CHECK (
          offering_id IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: lecturer can DELETE their own materials', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_materials' AND policyname='mat_lecturer_delete') THEN
        CREATE POLICY mat_lecturer_delete ON course_materials FOR DELETE USING (
          uploaded_by_membership_id IN (
            SELECT id FROM memberships WHERE profile_id = auth.uid() AND is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Policy: students can SELECT materials for enrolled courses', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='course_materials' AND policyname='mat_student_read') THEN
        CREATE POLICY mat_student_read ON course_materials FOR SELECT USING (
          offering_id IN (SELECT get_student_offering_ids(auth.uid()))
        );
      END IF;
    END $$;
  `)

  // 5. Storage bucket
  await run('Create storage bucket course-materials', `
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('course-materials', 'course-materials', false, 52428800)
    ON CONFLICT (id) DO NOTHING;
  `)

  // 6. Storage RLS policies (on storage.objects)
  await run('Storage policy: lecturers can upload', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='mat_storage_lecturer_insert') THEN
        CREATE POLICY mat_storage_lecturer_insert ON storage.objects FOR INSERT WITH CHECK (
          bucket_id = 'course-materials' AND
          (storage.foldername(name))[1]::uuid IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  await run('Storage policy: authenticated users can download (signed URLs)', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='mat_storage_read') THEN
        CREATE POLICY mat_storage_read ON storage.objects FOR SELECT USING (
          bucket_id = 'course-materials' AND auth.role() = 'authenticated'
        );
      END IF;
    END $$;
  `)

  await run('Storage policy: lecturers can delete their uploads', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='mat_storage_lecturer_delete') THEN
        CREATE POLICY mat_storage_lecturer_delete ON storage.objects FOR DELETE USING (
          bucket_id = 'course-materials' AND
          (storage.foldername(name))[1]::uuid IN (
            SELECT co.id FROM course_offerings co
            JOIN memberships m ON m.id = co.lecturer_membership_id
            WHERE m.profile_id = auth.uid() AND m.is_active = true
          )
        );
      END IF;
    END $$;
  `)

  console.log('\nDone.')
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
