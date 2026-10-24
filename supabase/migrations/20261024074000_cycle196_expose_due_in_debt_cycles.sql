-- CYCLE-196: expose irreversible policy due from private read-only snapshot,
-- without changing historical cycle membership or monetary values.
DO $patch$
DECLARE def text; oldtext text := '''threeDayStop'',e.closed_at is null and e.days_without_purchase>=3'; replacement text := '''threeDayStop'',e.closed_at is null and coalesce(
  (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''isDue'')::boolean,false)
  and (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''dueReason'')=''stopped_buying'',
  ''policyDueDay'',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''dueDay'' else null end,
  ''policyReason'',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''dueReason'' else null end,
  ''policyDaysOverdue'',case when e.closed_at is null
    then (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''daysOverdue'')::integer else 0 end,
  ''policyIsDue'',case when e.closed_at is null
    then coalesce((v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''isDue'')::boolean,false) else false end,
  ''policyFirstGapDay'',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>''firstGapDay'' else null end';
BEGIN
  SELECT pg_get_functiondef('public.taphoa_debt_cycles()'::regprocedure) INTO def;
  IF position('policyFirstGapDay' IN def)>0 THEN RETURN; END IF;
  IF position(oldtext IN def)=0 THEN
    RAISE EXCEPTION 'cycle_policy_rpc_anchor_not_found';
  END IF;
  EXECUTE replace(def,oldtext,replacement);
END;
$patch$;
