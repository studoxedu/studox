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
  console.log('Phase 6 — Paydesk\n');

  console.log('1. student_id on fee_invoices…');
  ok(await sql(`
    ALTER TABLE fee_invoices
      ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE RESTRICT;
  `),'fee_invoices.student_id');

  console.log('2. recorded_at on fee_payments (if missing)…');
  ok(await sql(`
    ALTER TABLE fee_payments
      ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID REFERENCES profiles(id);
  `),'fee_payments.recorded_by_user_id');

  console.log('3. _flow_fee_invoice_create…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_fee_invoice_create(p_payload JSONB, p_institution_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO fee_invoices (school_id, student_id, enrollment_id, description, amount_due, amount_paid, status, due_date)
      VALUES (
        p_institution_id,
        NULLIF(p_payload->>'student_id','')::UUID,
        NULLIF(p_payload->>'enrollment_id','')::UUID,
        p_payload->>'description',
        (p_payload->>'amount_due')::NUMERIC,
        0,
        'unpaid',
        NULLIF(p_payload->>'due_date','')::DATE
      ) RETURNING id INTO v_id;
      RETURN jsonb_build_object('invoice_id', v_id, 'ok', true);
    END;
    $fn$;
  `),'_flow_fee_invoice_create');

  console.log('4. _flow_fee_payment_record…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_fee_payment_record(p_payload JSONB, p_institution_id UUID, p_actor_id UUID)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_invoice_id UUID;
      v_amount     NUMERIC;
      v_paid       NUMERIC;
      v_due        NUMERIC;
      v_status     TEXT;
      v_pay_id     UUID;
    BEGIN
      v_invoice_id := (p_payload->>'invoice_id')::UUID;
      v_amount     := (p_payload->>'amount')::NUMERIC;
      IF v_invoice_id IS NULL THEN RAISE EXCEPTION 'invoice_id required'; END IF;
      IF v_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

      INSERT INTO fee_payments (invoice_id, school_id, amount, receipt_ref, payment_method, recorded_by)
      VALUES (
        v_invoice_id, p_institution_id, v_amount,
        COALESCE(p_payload->>'receipt_ref', 'REC-' || to_char(now(), 'YYYYMMDD-HH24MI')),
        COALESCE(p_payload->>'payment_method', 'cash'),
        p_actor_id::TEXT
      ) RETURNING id INTO v_pay_id;

      -- Recompute invoice status
      SELECT amount_paid + v_amount, amount_due
      INTO v_paid, v_due
      FROM fee_invoices WHERE id = v_invoice_id;

      v_status := CASE
        WHEN v_paid >= v_due THEN 'paid'
        WHEN v_paid > 0      THEN 'partial'
        ELSE 'unpaid'
      END;

      UPDATE fee_invoices
      SET amount_paid = v_paid, status = v_status
      WHERE id = v_invoice_id;

      RETURN jsonb_build_object('payment_id', v_pay_id, 'new_status', v_status, 'ok', true);
    END;
    $fn$;
  `),'_flow_fee_payment_record');

  console.log('5. _flow_fee_waive…');
  ok(await sql(`
    CREATE OR REPLACE FUNCTION _flow_fee_waive(p_payload JSONB)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      UPDATE fee_invoices
      SET status = 'waived', amount_due = amount_paid
      WHERE id = (p_payload->>'invoice_id')::UUID;
      RETURN jsonb_build_object('ok', true);
    END;
    $fn$;
  `),'_flow_fee_waive');

  console.log('6. Update flow_execute with Paydesk arms…');
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
        ELSE RAISE EXCEPTION 'flow_execute: no handler for capability "%"', p_capability;
      END CASE;

      INSERT INTO flow_log (capability, actor_user_id, office_instance_id, delegation_id, payload, result)
      VALUES (p_capability, v_user_id, v_office_id, v_delegation_id, p_payload, v_result)
      RETURNING id INTO v_log_id;

      RETURN jsonb_build_object('ok',true,'log_id',v_log_id,'office_id',v_office_id,'result',v_result);
    END;
    $fn$;
  `),'flow_execute');

  console.log('7. RLS on fee_invoices for student self-read…');
  ok(await sql(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fee_invoices' AND policyname='fi_student_read') THEN
        CREATE POLICY fi_student_read ON fee_invoices FOR SELECT TO authenticated
          USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));
      END IF;
    END $$;
  `),'fi student rls');

  console.log('\nPhase 6 Paydesk complete.');
}
run().catch(e=>{console.error(e);process.exit(1);});
