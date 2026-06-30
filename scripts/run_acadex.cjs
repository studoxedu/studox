const https = require('https');

const PAT         = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9';
const PROJECT_REF = 'fghdgtihpvaehykgqgro';
const SCHOOL_ID   = '00000000-0000-0000-0000-000000000003';

function sql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ok(r, step) {
  if (r && r.error) { console.error(`FAIL [${step}]:`, r.error); process.exit(1); }
  if (r && r.message && r.message.includes('ERROR')) { console.error(`FAIL [${step}]:`, r.message); process.exit(1); }
  console.log(`   OK`);
}

async function run() {
  console.log('Phase 4 — Acadex migration\n');

  // 1. Schema changes
  console.log('1. Schema: grade_point on course_registrations, lecturer_assignment_id on offerings…');
  ok(await sql(`
    ALTER TABLE course_registrations
      ADD COLUMN IF NOT EXISTS grade_point NUMERIC;

    ALTER TABLE course_offerings
      ADD COLUMN IF NOT EXISTS lecturer_assignment_id UUID REFERENCES office_assignments(id);
  `), 'schema');

  // 2. Partial unique index for tertiary score upserts
  console.log('2. Partial unique index on course_registrations(offering_id, student_id)…');
  ok(await sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_course_reg_tertiary
    ON course_registrations (offering_id, student_id)
    WHERE student_id IS NOT NULL;
  `), 'unique index');

  // 3. _flow_offering_create
  console.log('3. Creating _flow_offering_create…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_offering_create(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id UUID;
    BEGIN
      IF (p_payload->>'course_id') IS NULL    THEN RAISE EXCEPTION 'course_id required';    END IF;
      IF (p_payload->>'semester_id') IS NULL  THEN RAISE EXCEPTION 'semester_id required';  END IF;

      INSERT INTO course_offerings (course_id, semester_id, results_status)
      VALUES (
        (p_payload->>'course_id')::UUID,
        (p_payload->>'semester_id')::UUID,
        'draft'
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM course_offerings
        WHERE course_id  = (p_payload->>'course_id')::UUID
          AND semester_id = (p_payload->>'semester_id')::UUID;
      END IF;

      RETURN jsonb_build_object('offering_id', v_id, 'ok', true);
    END;
    $fn$;
  `), '_flow_offering_create');

  // 4. _flow_offering_assign_lecturer
  console.log('4. Creating _flow_offering_assign_lecturer…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_offering_assign_lecturer(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE course_offerings
      SET lecturer_assignment_id = (p_payload->>'assignment_id')::UUID
      WHERE id = (p_payload->>'offering_id')::UUID;
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `), '_flow_offering_assign_lecturer');

  // 5. _flow_course_create
  console.log('5. Creating _flow_course_create…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_course_create(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO courses (department_id, code, title, credit_units)
      VALUES (
        (p_payload->>'department_id')::UUID,
        p_payload->>'code',
        p_payload->>'title',
        COALESCE((p_payload->>'credit_units')::INTEGER, 3)
      )
      RETURNING id INTO v_id;
      RETURN jsonb_build_object('course_id', v_id, 'ok', true);
    END;
    $fn$;
  `), '_flow_course_create');

  // 6. _flow_result_submit  (bulk score upsert + status → submitted)
  console.log('6. Creating _flow_result_submit…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_result_submit(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_offering_id UUID;
      score         JSONB;
      v_count       INTEGER := 0;
    BEGIN
      v_offering_id := (p_payload->>'offering_id')::UUID;
      IF v_offering_id IS NULL THEN RAISE EXCEPTION 'offering_id required'; END IF;

      FOR score IN SELECT * FROM jsonb_array_elements(p_payload->'scores')
      LOOP
        INSERT INTO course_registrations (offering_id, student_id, ca_score, exam_score)
        VALUES (
          v_offering_id,
          (score->>'student_id')::UUID,
          NULLIF(score->>'ca_score',   '')::NUMERIC,
          NULLIF(score->>'exam_score', '')::NUMERIC
        )
        ON CONFLICT (offering_id, student_id) WHERE student_id IS NOT NULL
        DO UPDATE SET
          ca_score   = NULLIF(EXCLUDED.ca_score::TEXT,   '')::NUMERIC,
          exam_score = NULLIF(EXCLUDED.exam_score::TEXT, '')::NUMERIC;
        v_count := v_count + 1;
      END LOOP;

      UPDATE course_offerings SET results_status = 'submitted'
      WHERE id = v_offering_id AND results_status = 'draft';

      RETURN jsonb_build_object('offering_id', v_offering_id, 'rows_upserted', v_count, 'ok', true);
    END;
    $fn$;
  `), '_flow_result_submit');

  // 7. _flow_result_verify
  console.log('7. Creating _flow_result_verify…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_result_verify(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE course_offerings SET results_status = 'verified'
      WHERE id = (p_payload->>'offering_id')::UUID
        AND results_status = 'submitted';
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `), '_flow_result_verify');

  // 8. _flow_result_approve
  console.log('8. Creating _flow_result_approve…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_result_approve(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE course_offerings SET results_status = 'approved'
      WHERE id = (p_payload->>'offering_id')::UUID
        AND results_status = 'verified';
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `), '_flow_result_approve');

  // 9. _flow_result_publish  (compute grades from grade_scales then publish)
  console.log('9. Creating _flow_result_publish…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_result_publish(p_payload JSONB, p_institution_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_offering_id UUID;
      v_graded      INTEGER;
    BEGIN
      v_offering_id := (p_payload->>'offering_id')::UUID;
      IF v_offering_id IS NULL THEN RAISE EXCEPTION 'offering_id required'; END IF;

      -- Compute grade + grade_point from school's grade scale
      WITH scored AS (
        SELECT cr.id,
               COALESCE(cr.ca_score, 0) + COALESCE(cr.exam_score, 0) AS total
        FROM course_registrations cr
        WHERE cr.offering_id = v_offering_id
          AND cr.student_id IS NOT NULL
      )
      UPDATE course_registrations cr
      SET
        grade       = gs.grade,
        grade_point = gs.grade_point
      FROM scored s
      JOIN grade_scales gs ON gs.school_id = p_institution_id
        AND s.total BETWEEN gs.min_score AND gs.max_score
      WHERE cr.id = s.id;

      GET DIAGNOSTICS v_graded = ROW_COUNT;

      UPDATE course_offerings SET results_status = 'published'
      WHERE id = v_offering_id AND results_status = 'approved';

      RETURN jsonb_build_object('offering_id', v_offering_id, 'graded', v_graded, 'ok', true);
    END;
    $fn$;
  `), '_flow_result_publish');

  // 10. Update flow_execute with all Acadex arms
  console.log('10. Updating flow_execute with Acadex dispatch…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION flow_execute(
      p_capability TEXT,
      p_payload    JSONB,
      p_office_id  UUID DEFAULT NULL
    ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_user_id        UUID;
      v_office_id      UUID;
      v_institution_id UUID;
      v_delegation_id  UUID;
      v_result         JSONB;
      v_log_id         UUID;
    BEGIN
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'flow_execute: not authenticated';
      END IF;

      SELECT oa.office_instance_id, oi.institution_id
      INTO   v_office_id, v_institution_id
      FROM   office_assignments oa
      JOIN   office_instances oi          ON oi.id = oa.office_instance_id
      JOIN   office_type_capabilities otc ON otc.office_type_id = oi.office_type_id
      JOIN   tert_capabilities tc         ON tc.id = otc.capability_id
      WHERE  oa.profile_id = v_user_id
        AND  oa.is_active  = true
        AND  oi.is_active  = true
        AND  tc.code       = p_capability
        AND  (p_office_id IS NULL OR oa.office_instance_id = p_office_id)
      LIMIT 1;

      IF v_office_id IS NULL THEN
        SELECT od.delegate_office_id, oi2.institution_id, od.id
        INTO   v_office_id, v_institution_id, v_delegation_id
        FROM   office_delegations od
        JOIN   office_assignments oa ON oa.office_instance_id = od.delegate_office_id
        JOIN   office_instances oi2  ON oi2.id = od.delegate_office_id
        JOIN   tert_capabilities tc  ON tc.id = od.capability_id
        WHERE  oa.profile_id = v_user_id
          AND  oa.is_active  = true
          AND  od.is_active  = true
          AND  tc.code       = p_capability
          AND  (od.expires_at IS NULL OR od.expires_at > now())
          AND  (p_office_id IS NULL OR od.delegate_office_id = p_office_id)
        LIMIT 1;
      END IF;

      IF v_office_id IS NULL THEN
        RAISE EXCEPTION 'flow_execute: unauthorized — capability "%" not held', p_capability;
      END IF;

      CASE p_capability
        WHEN 'student.create'           THEN v_result := _flow_student_create(p_payload, v_user_id, v_institution_id);
        WHEN 'student.update'           THEN v_result := _flow_student_update(p_payload);
        WHEN 'student.suspend',
             'student.withdraw',
             'student.graduate'         THEN v_result := _flow_student_status(p_capability, p_payload);
        WHEN 'institution.configure'    THEN v_result := _flow_institution_configure(p_payload, v_institution_id);
        WHEN 'office.assign'            THEN v_result := _flow_office_assign(p_payload, v_user_id);
        WHEN 'office.unassign'          THEN v_result := _flow_office_unassign(p_payload);
        WHEN 'delegation.grant'         THEN v_result := _flow_delegation_grant(p_payload, v_user_id);
        WHEN 'delegation.revoke'        THEN v_result := _flow_delegation_revoke(p_payload);
        WHEN 'course.create'            THEN v_result := _flow_course_create(p_payload);
        WHEN 'offering.create'          THEN v_result := _flow_offering_create(p_payload);
        WHEN 'offering.assign_lecturer' THEN v_result := _flow_offering_assign_lecturer(p_payload);
        WHEN 'result.submit'            THEN v_result := _flow_result_submit(p_payload);
        WHEN 'result.verify'            THEN v_result := _flow_result_verify(p_payload);
        WHEN 'result.approve'           THEN v_result := _flow_result_approve(p_payload);
        WHEN 'result.publish'           THEN v_result := _flow_result_publish(p_payload, v_institution_id);
        ELSE RAISE EXCEPTION 'flow_execute: no handler for capability "%"', p_capability;
      END CASE;

      INSERT INTO flow_log (capability, actor_user_id, office_instance_id, delegation_id, payload, result)
      VALUES (p_capability, v_user_id, v_office_id, v_delegation_id, p_payload, v_result)
      RETURNING id INTO v_log_id;

      RETURN jsonb_build_object(
        'ok',        true,
        'log_id',    v_log_id,
        'office_id', v_office_id,
        'result',    v_result
      );
    END;
    $fn$;
  `), 'flow_execute');

  // 11. Verify
  console.log('\n11. Verification…');
  const v = await sql(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'course_registrations' AND column_name = 'grade_point') AS has_grade_point,
      (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'course_offerings' AND column_name = 'lecturer_assignment_id') AS has_lec_assign,
      (SELECT COUNT(*) FROM pg_indexes
         WHERE tablename = 'course_registrations' AND indexname = 'idx_course_reg_tertiary') AS has_idx,
      (SELECT COUNT(*) FROM information_schema.routines
         WHERE routine_schema='public' AND routine_name LIKE '_flow_%') AS action_fn_count;
  `);
  if (v && v[0]) {
    const d = v[0];
    console.log(`   grade_point column:         ${d.has_grade_point === '1' ? 'YES' : 'MISSING'}`);
    console.log(`   lecturer_assignment_id col:  ${d.has_lec_assign === '1' ? 'YES' : 'MISSING'}`);
    console.log(`   partial unique index:        ${d.has_idx === '1' ? 'YES' : 'MISSING'}`);
    console.log(`   action functions (_flow_*):  ${d.action_fn_count}`);
  }

  console.log('\nPhase 4 Acadex migration complete.');
}

run().catch(err => { console.error(err); process.exit(1); });
