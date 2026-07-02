const https = require('https');

const PAT         = process.env.SUPABASE_PAT;
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

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
  console.log('Phase 3 — Coredesk action handlers\n');

  // 1. _flow_office_assign
  console.log('1. Creating _flow_office_assign…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_office_assign(p_payload JSONB, p_actor_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_office_id UUID;
      v_profile_id UUID;
      v_aid UUID;
    BEGIN
      v_office_id  := (p_payload->>'office_instance_id')::UUID;
      v_profile_id := (p_payload->>'profile_id')::UUID;
      IF v_office_id  IS NULL THEN RAISE EXCEPTION 'office_instance_id required'; END IF;
      IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile_id required'; END IF;

      INSERT INTO office_assignments (profile_id, office_instance_id, is_active, assigned_by)
      VALUES (v_profile_id, v_office_id, true, p_actor_id)
      ON CONFLICT (profile_id, office_instance_id)
      DO UPDATE SET is_active = true, assigned_by = p_actor_id, assigned_at = now()
      RETURNING id INTO v_aid;

      RETURN jsonb_build_object('assignment_id', v_aid, 'ok', true);
    END;
    $fn$;
  `), '_flow_office_assign');

  // 2. _flow_office_unassign
  console.log('2. Creating _flow_office_unassign…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_office_unassign(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_aid UUID;
    BEGIN
      v_aid := (p_payload->>'assignment_id')::UUID;
      IF v_aid IS NULL THEN RAISE EXCEPTION 'assignment_id required'; END IF;
      UPDATE office_assignments SET is_active = false WHERE id = v_aid;
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `), '_flow_office_unassign');

  // 3. _flow_delegation_grant
  console.log('3. Creating _flow_delegation_grant…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_delegation_grant(p_payload JSONB, p_actor_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_cap_id UUID;
      v_del_id UUID;
    BEGIN
      SELECT id INTO v_cap_id FROM tert_capabilities WHERE code = p_payload->>'capability_code';
      IF v_cap_id IS NULL THEN
        RAISE EXCEPTION 'Unknown capability: %', p_payload->>'capability_code';
      END IF;

      INSERT INTO office_delegations (
        grantor_office_id, delegate_office_id, capability_id,
        is_active, expires_at, reason, granted_by
      ) VALUES (
        (p_payload->>'grantor_office_id')::UUID,
        (p_payload->>'delegate_office_id')::UUID,
        v_cap_id,
        true,
        NULLIF(p_payload->>'expires_at', '')::TIMESTAMPTZ,
        NULLIF(p_payload->>'reason', ''),
        p_actor_id
      ) RETURNING id INTO v_del_id;

      RETURN jsonb_build_object('delegation_id', v_del_id, 'ok', true);
    END;
    $fn$;
  `), '_flow_delegation_grant');

  // 4. _flow_delegation_revoke
  console.log('4. Creating _flow_delegation_revoke…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_delegation_revoke(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE office_delegations SET is_active = false
      WHERE id = (p_payload->>'delegation_id')::UUID;
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `), '_flow_delegation_revoke');

  // 5. Update flow_execute with new dispatch arms
  console.log('5. Updating flow_execute with Coredesk actions…');
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

      -- 1. Direct capability
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
        RAISE EXCEPTION 'flow_execute: unauthorized — capability "%" not held', p_capability;
      END IF;

      -- 3. Dispatch
      CASE p_capability
        WHEN 'student.create'      THEN v_result := _flow_student_create(p_payload, v_user_id, v_institution_id);
        WHEN 'student.update'      THEN v_result := _flow_student_update(p_payload);
        WHEN 'student.suspend',
             'student.withdraw',
             'student.graduate'    THEN v_result := _flow_student_status(p_capability, p_payload);
        WHEN 'institution.configure' THEN v_result := _flow_institution_configure(p_payload, v_institution_id);
        WHEN 'office.assign'       THEN v_result := _flow_office_assign(p_payload, v_user_id);
        WHEN 'office.unassign'     THEN v_result := _flow_office_unassign(p_payload);
        WHEN 'delegation.grant'    THEN v_result := _flow_delegation_grant(p_payload, v_user_id);
        WHEN 'delegation.revoke'   THEN v_result := _flow_delegation_revoke(p_payload);
        ELSE RAISE EXCEPTION 'flow_execute: no handler for capability "%"', p_capability;
      END CASE;

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

  // 6. Grant institution_admin the office.unassign capability (oversight)
  console.log('6. Adding office.unassign to institution_admin + registrar to office.assign…');
  ok(await sql(`
    INSERT INTO tert_capabilities (code, label)
    VALUES ('office.unassign', 'Remove person from office')
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO office_type_capabilities (office_type_id, capability_id)
    SELECT ot.id, tc.id
    FROM office_types ot, tert_capabilities tc
    WHERE (ot.code = 'institution_admin' AND tc.code = 'office.unassign')
       OR (ot.code = 'institution_admin' AND tc.code = 'office.assign')
    ON CONFLICT DO NOTHING;
  `), 'office.unassign cap');

  // 7. Verify
  console.log('\n7. Verification…');
  const v = await sql(`
    SELECT
      (SELECT COUNT(*) FROM tert_capabilities) AS cap_count,
      (SELECT COUNT(*) FROM office_type_capabilities) AS otc_count,
      (SELECT COUNT(*) FROM information_schema.routines
         WHERE routine_schema='public' AND routine_name LIKE '_flow_%') AS action_fn_count;
  `);
  if (v && v[0]) {
    const d = v[0];
    console.log(`   tert_capabilities:       ${d.cap_count}`);
    console.log(`   office_type_capabilities: ${d.otc_count}`);
    console.log(`   action functions (_flow_*): ${d.action_fn_count}`);
  }

  console.log('\nPhase 3 Coredesk migration complete.');
}

run().catch(err => { console.error(err); process.exit(1); });
