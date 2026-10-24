-- CYCLE-196: one order receipt with cycle start/continuation notice, no extra Chat spam.
-- Apply only to first delivery, never edit, no pending/draft.
DO $patch$
DECLARE def text; needle text := '    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,'; updated text := '    -- CYCLE-196: append policy to the EXISTING delivered-order receipt;
    -- pending orders and corrections to delivered orders never start a cycle.
    if v_edit_id is null or (v_old_status=''pending'' and v_status=''delivered'') then
      v_notice := v_notice || coalesce(
        v21_private.taphoa_order_cycle_policy_note(v_customer,v_order.id),'''');
    end if;

    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,';
BEGIN
 SELECT pg_get_functiondef('public.taphoa_save_order(jsonb,uuid)'::regprocedure) INTO def;
 IF position('CYCLE-196: append policy' IN def)>0 THEN RETURN; END IF;
 IF position(needle IN def)=0 THEN
  RAISE EXCEPTION 'cycle196_delivered_order_notice_anchor_missing';
 END IF;
 EXECUTE replace(def,needle,updated);
END;
$patch$;