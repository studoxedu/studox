const https = require('https');
const PAT = 'sbp_7f1e0eb73357280b5c2ee9ac7c490c651d4d7ee9';
const PROJECT_REF = 'fghdgtihpvaehykgqgro';

function sql(q) {
  return new Promise((res,rej) => {
    const body = JSON.stringify({query:q});
    const req = https.request({hostname:'api.supabase.com',path:`/v1/projects/${PROJECT_REF}/database/query`,method:'POST',headers:{'Authorization':`Bearer ${PAT}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch{res({raw:d})}});
    });
    req.on('error',rej); req.write(body); req.end();
  });
}
function ok(r,s){if(r&&r.error){console.error(`FAIL[${s}]:`,r.error);process.exit(1);}console.log('   OK');}

async function run() {
  console.log('Senate Ratification\n');

  console.log('1. senate_ratifications table…');
  ok(await sql(`
    CREATE TABLE IF NOT EXISTS senate_ratifications (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id           UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      semester_id         UUID        NOT NULL UNIQUE REFERENCES semesters(id) ON DELETE RESTRICT,
      resolution_number   TEXT,
      meeting_date        DATE,
      notes               TEXT,
      ratified_by_user_id UUID        REFERENCES profiles(id),
      ratified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE senate_ratifications ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='senate_ratifications' AND policyname='sr_auth') THEN
        CREATE POLICY sr_auth ON senate_ratifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
      END IF;
    END $$;
  `),'senate_ratifications');

  console.log('2. senate.ratify capability…');
  ok(await sql(`
    INSERT INTO tert_capabilities (code, label, description)
    VALUES ('senate.ratify','Ratify Results','Senate formal ratification of published semester results')
    ON CONFLICT (code) DO NOTHING;
  `),'senate.ratify cap');

  console.log('3. senate_secretary office type…');
  ok(await sql(`
    INSERT INTO office_types (code, label, governance_mode)
    VALUES ('senate_secretary','Senate Secretariat','tertiary')
    ON CONFLICT (code) DO NOTHING;
  `),'senate_secretary office type');

  console.log('4. Map senate.ratify → senate_secretary + school_admin…');
  ok(await sql(`
    INSERT INTO office_type_capabilities (office_type_id, capability_id)
    SELECT ot.id, tc.id
    FROM office_types ot, tert_capabilities tc
    WHERE ot.code IN ('senate_secretary','school_admin')
      AND tc.code = 'senate.ratify'
    ON CONFLICT DO NOTHING;
  `),'capability mapping');

  console.log('5. get_semester_audit_log() helper…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION get_semester_audit_log(p_semester_id UUID)
    RETURNS TABLE (
      id UUID, capability TEXT, actor_user_id UUID, created_at TIMESTAMPTZ,
      payload JSONB, result JSONB, office_instance_id UUID
    ) LANGUAGE sql SECURITY DEFINER AS $fn$
      SELECT fl.id, fl.capability, fl.actor_user_id, fl.created_at, fl.payload, fl.result, fl.office_instance_id
      FROM flow_log fl
      WHERE fl.capability LIKE 'result.%'
        AND fl.payload->>'offering_id' IN (
          SELECT co.id::TEXT FROM course_offerings co WHERE co.semester_id = p_semester_id
        )
      ORDER BY fl.created_at DESC
      LIMIT 200;
    $fn$;
  `),'get_semester_audit_log');

  console.log('6. _flow_senate_ratify action function…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_senate_ratify(p_payload JSONB, p_institution_id UUID, p_actor_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_semester_id       UUID;
      v_unpublished_count INT;
      v_total_count       INT;
      v_id                UUID;
    BEGIN
      v_semester_id := (p_payload->>'semester_id')::UUID;
      IF v_semester_id IS NULL THEN RAISE EXCEPTION 'semester_id required'; END IF;

      SELECT COUNT(*), COUNT(*) FILTER (WHERE results_status != 'published')
      INTO v_total_count, v_unpublished_count
      FROM course_offerings
      WHERE semester_id = v_semester_id;

      IF v_total_count = 0 THEN
        RAISE EXCEPTION 'No course offerings found for this semester';
      END IF;

      IF v_unpublished_count > 0 THEN
        RAISE EXCEPTION '% offering(s) not yet published — all results must be published before senate can ratify', v_unpublished_count;
      END IF;

      IF EXISTS (SELECT 1 FROM senate_ratifications WHERE semester_id = v_semester_id) THEN
        RAISE EXCEPTION 'Semester results have already been ratified';
      END IF;

      INSERT INTO senate_ratifications (
        school_id, semester_id, resolution_number, meeting_date, notes, ratified_by_user_id
      ) VALUES (
        p_institution_id,
        v_semester_id,
        NULLIF(p_payload->>'resolution_number',''),
        NULLIF(p_payload->>'meeting_date','')::DATE,
        NULLIF(p_payload->>'notes',''),
        p_actor_id
      ) RETURNING id INTO v_id;

      RETURN jsonb_build_object('ratification_id', v_id, 'semester_id', v_semester_id, 'ok', true);
    END;
    $fn$;
  `),'_flow_senate_ratify');

  console.log('7. Update flow_execute with senate arm…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION flow_execute(
      p_capability TEXT, p_payload JSONB, p_office_id UUID DEFAULT NULL
    ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_user_id UUID; v_office_id UUID; v_institution_id UUID;
      v_delegation_id UUID; v_result JSONB; v_log_id UUID;
    BEGIN
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN RAISE EXCEPTION 'flow_execute: not authenticated'; END IF;

      SELECT oa.office_instance_id, oi.institution_id
      INTO   v_office_id, v_institution_id
      FROM   office_assignments oa
      JOIN   office_instances oi          ON oi.id = oa.office_instance_id
      JOIN   office_type_capabilities otc ON otc.office_type_id = oi.office_type_id
      JOIN   tert_capabilities tc         ON tc.id = otc.capability_id
      WHERE  oa.profile_id = v_user_id AND oa.is_active = true AND oi.is_active = true
        AND  tc.code = p_capability
        AND  (p_office_id IS NULL OR oa.office_instance_id = p_office_id)
      LIMIT 1;

      IF v_office_id IS NULL THEN
        SELECT od.delegate_office_id, oi2.institution_id, od.id
        INTO   v_office_id, v_institution_id, v_delegation_id
        FROM   office_delegations od
        JOIN   office_assignments oa ON oa.office_instance_id = od.delegate_office_id
        JOIN   office_instances oi2  ON oi2.id = od.delegate_office_id
        JOIN   tert_capabilities tc  ON tc.id = od.capability_id
        WHERE  oa.profile_id = v_user_id AND oa.is_active = true AND od.is_active = true
          AND  tc.code = p_capability
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
        WHEN 'student.suspend','student.withdraw','student.graduate'
                                        THEN v_result := _flow_student_status(p_capability, p_payload);
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
        WHEN 'fee.invoice_create'       THEN v_result := _flow_fee_invoice_create(p_payload, v_institution_id);
        WHEN 'fee.payment_record'       THEN v_result := _flow_fee_payment_record(p_payload, v_institution_id, v_user_id);
        WHEN 'fee.waive'                THEN v_result := _flow_fee_waive(p_payload);
        WHEN 'senate.ratify'            THEN v_result := _flow_senate_ratify(p_payload, v_institution_id, v_user_id);
        ELSE RAISE EXCEPTION 'flow_execute: no handler for capability "%"', p_capability;
      END CASE;

      INSERT INTO flow_log (capability, actor_user_id, office_instance_id, delegation_id, payload, result)
      VALUES (p_capability, v_user_id, v_office_id, v_delegation_id, p_payload, v_result)
      RETURNING id INTO v_log_id;

      RETURN jsonb_build_object('ok',true,'log_id',v_log_id,'office_id',v_office_id,'result',v_result);
    END;
    $fn$;
  `),'flow_execute');

  console.log('\nSenate migration complete.');
}
run().catch(e=>{console.error(e);process.exit(1);});
