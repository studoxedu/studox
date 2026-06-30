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
  console.log('Fixing Flow — tert_capabilities + FK rewiring\n');

  // 1. Create tert_capabilities (the real vocabulary table)
  console.log('1. Creating tert_capabilities…');
  ok(await sql(`
    CREATE TABLE IF NOT EXISTS tert_capabilities (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code        TEXT UNIQUE NOT NULL,
      label       TEXT NOT NULL,
      description TEXT
    );
  `), 'tert_capabilities');

  // 2. Seed tert_capabilities
  console.log('2. Seeding capability vocabulary into tert_capabilities…');
  ok(await sql(`
    INSERT INTO tert_capabilities (code, label) VALUES
      ('student.create',           'Admit new student'),
      ('student.update',           'Update student record'),
      ('student.suspend',          'Suspend student'),
      ('student.withdraw',         'Withdraw student'),
      ('student.graduate',         'Graduate student'),
      ('course.create',            'Create course'),
      ('course.update',            'Update course'),
      ('offering.create',          'Create course offering'),
      ('offering.assign_lecturer', 'Assign lecturer to offering'),
      ('result.submit',            'Submit assessment scores'),
      ('result.verify',            'Verify submitted scores'),
      ('result.approve',           'Approve results for release'),
      ('result.publish',           'Publish results'),
      ('fee.invoice_create',       'Create fee invoice'),
      ('fee.payment_record',       'Record fee payment'),
      ('fee.waive',                'Waive fee'),
      ('session.create',           'Create academic session'),
      ('semester.create',          'Create semester'),
      ('institution.configure',    'Configure institution settings'),
      ('staff.create',             'Create staff record'),
      ('staff.assign_office',      'Assign staff to an office'),
      ('delegation.grant',         'Grant capability delegation'),
      ('delegation.revoke',        'Revoke capability delegation'),
      ('office.create',            'Create office instance'),
      ('office.assign',            'Assign person to office'),
      ('timetable.manage',         'Manage timetable')
    ON CONFLICT (code) DO NOTHING;
  `), 'tert_capabilities seed');

  // 3. Rewire office_type_capabilities FK → tert_capabilities
  console.log('3. Rewiring office_type_capabilities FK to tert_capabilities…');
  ok(await sql(`
    ALTER TABLE office_type_capabilities
      DROP CONSTRAINT IF EXISTS office_type_capabilities_capability_id_fkey;
    ALTER TABLE office_type_capabilities
      ADD CONSTRAINT office_type_capabilities_capability_id_fkey
      FOREIGN KEY (capability_id) REFERENCES tert_capabilities(id) ON DELETE CASCADE;
  `), 'otc fk');

  // 4. Rewire office_delegations FK → tert_capabilities
  console.log('4. Rewiring office_delegations FK to tert_capabilities…');
  ok(await sql(`
    ALTER TABLE office_delegations
      DROP CONSTRAINT IF EXISTS office_delegations_capability_id_fkey;
    ALTER TABLE office_delegations
      ADD CONSTRAINT office_delegations_capability_id_fkey
      FOREIGN KEY (capability_id) REFERENCES tert_capabilities(id) ON DELETE CASCADE;
  `), 'od fk');

  // 5. Insert office_type → capability mappings
  console.log('5. Inserting office_type_capabilities mappings…');
  ok(await sql(`
    INSERT INTO office_type_capabilities (office_type_id, capability_id)
    SELECT ot.id, tc.id
    FROM office_types ot
    JOIN tert_capabilities tc ON true
    WHERE (ot.code = 'institution_admin' AND tc.code IN (
            'institution.configure','office.create','office.assign',
            'staff.create','staff.assign_office',
            'delegation.grant','delegation.revoke',
            'session.create','semester.create'))
       OR (ot.code = 'registrar' AND tc.code IN (
            'student.create','student.update','student.suspend',
            'student.withdraw','student.graduate',
            'result.publish','session.create','semester.create'))
       OR (ot.code = 'dean' AND tc.code IN (
            'result.approve','offering.create','course.create'))
       OR (ot.code = 'hod' AND tc.code IN (
            'result.verify','offering.create','offering.assign_lecturer',
            'course.create','course.update'))
       OR (ot.code = 'exam_officer' AND tc.code IN (
            'result.verify','result.approve','result.publish'))
       OR (ot.code = 'lecturer' AND tc.code IN ('result.submit'))
       OR (ot.code = 'bursar'   AND tc.code IN (
            'fee.invoice_create','fee.payment_record','fee.waive'))
    ON CONFLICT DO NOTHING;
  `), 'otc mappings');

  // 6. Recreate flow_execute referencing tert_capabilities
  console.log('6. Recreating flow_execute with tert_capabilities…');
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

      -- 1. Direct capability via office_assignments
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

      -- 2. Delegated capability
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
        RAISE EXCEPTION 'flow_execute: unauthorized — capability "%" not held by any active office', p_capability;
      END IF;

      -- 3. Dispatch
      IF p_capability = 'student.create' THEN
        v_result := _flow_student_create(p_payload, v_user_id, v_institution_id);
      ELSIF p_capability = 'institution.configure' THEN
        v_result := _flow_institution_configure(p_payload, v_institution_id);
      ELSIF p_capability = 'student.update' THEN
        v_result := _flow_student_update(p_payload);
      ELSIF p_capability IN ('student.suspend','student.withdraw','student.graduate') THEN
        v_result := _flow_student_status(p_capability, p_payload);
      ELSE
        RAISE EXCEPTION 'flow_execute: no action handler for capability "%"', p_capability;
      END IF;

      -- 4. Immutable log
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

  // 7. Fix _flow_institution_configure (the FOR loop DECLARE was in wrong place)
  console.log('7. Fixing _flow_institution_configure…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_institution_configure(
      p_payload        JSONB,
      p_institution_id UUID
    ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      rec JSONB;
    BEGIN
      UPDATE schools
      SET code               = COALESCE(NULLIF(p_payload->>'code',''), code),
          reg_number_pattern = COALESCE(NULLIF(p_payload->>'reg_number_pattern',''), reg_number_pattern)
      WHERE id = p_institution_id;

      IF p_payload ? 'department_codes' THEN
        FOR rec IN SELECT * FROM jsonb_array_elements(p_payload->'department_codes')
        LOOP
          UPDATE departments
          SET code = NULLIF(rec->>'code','')
          WHERE id = (rec->>'id')::UUID;
        END LOOP;
      END IF;

      RETURN jsonb_build_object('institution_id', p_institution_id, 'ok', true);
    END;
    $fn$;
  `), '_flow_institution_configure');

  // 8. Verify
  console.log('\n8. Verification…');
  const v = await sql(`
    SELECT
      (SELECT COUNT(*) FROM tert_capabilities)          AS cap_count,
      (SELECT COUNT(*) FROM office_type_capabilities)   AS otc_count,
      (SELECT COUNT(*) FROM office_assignments oa
         JOIN office_instances oi ON oi.id = oa.office_instance_id
         WHERE oi.institution_id = '${SCHOOL_ID}')      AS assignments;
  `);
  if (v && v[0]) {
    const d = v[0];
    console.log(`   tert_capabilities:       ${d.cap_count}`);
    console.log(`   office_type_capabilities: ${d.otc_count}`);
    console.log(`   office assignments:       ${d.assignments}`);
  }

  // Quick end-to-end test: can we check capabilities for assignment?
  const capTest = await sql(`
    SELECT tc.code
    FROM office_assignments oa
    JOIN office_instances oi          ON oi.id = oa.office_instance_id
    JOIN office_type_capabilities otc ON otc.office_type_id = oi.office_type_id
    JOIN tert_capabilities tc         ON tc.id = otc.capability_id
    JOIN office_types ot              ON ot.id = oi.office_type_id
    WHERE oi.institution_id = '${SCHOOL_ID}'
      AND oa.is_active = true
    ORDER BY ot.code, tc.code
    LIMIT 10;
  `);
  console.log('\n   Capability check (first 10):', capTest.map(r => r.code));

  console.log('\nFix complete.');
}

run().catch(err => { console.error(err); process.exit(1); });
