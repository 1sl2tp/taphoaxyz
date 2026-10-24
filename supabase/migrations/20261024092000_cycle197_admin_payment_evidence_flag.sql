-- CYCLE-197: allow Admin to distinguish overdue customers awaiting bill review.
DO $patch$
DECLARE definition text; oldtext text:='''policyFirstGapDay'',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''firstGapDay'' else null end'; replacement text:='''policyFirstGapDay'',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''firstGapDay'' else null end,
  ''policyPendingEvidence'',case when e.closed_at is null
    then v21_private.taphoa_cycle_payment_pending(e.customer_account_id) else false end';
BEGIN
 SELECT pg_get_functiondef('public.taphoa_debt_cycles()'::regprocedure) INTO definition;
 IF position('policyPendingEvidence' in definition)>0 THEN RETURN; END IF;
 IF position(oldtext in definition)=0 THEN RAISE EXCEPTION 'cycle197_risk_flag_anchor_missing'; END IF;
 EXECUTE replace(definition,oldtext,replacement);
END;
$patch$;