-- NOTICE-282: unify creation/edit/delivery notifications as immediate
-- opted-in business events. An edited delivered order must not wait until
-- 08:05. Preserve all existing guardrails (Admin auth, customer opt-in,
-- stable client_id dedupe, image attachments, Chat/Zalo pipeline).
--
-- Legacy queued edit rows are NOT deleted or silently sent by this migration.
-- A separate controlled, single dispatch followed by retiring the legacy
-- cron is required after validating the queue.
BEGIN;

DO $notice282_immediate$
DECLARE
  src text;
  rewritten text;
  v_begin integer;
  v_end integer;
  block_start text := 'IF v_client_id LIKE ''taphoa:%:order-edit'' THEN';
  block_end text := 'select c.id';
  immediate text := $immediate$
IF v_client_id LIKE 'taphoa:%:order-edit' AND v_order.id IS NOT NULL THEN
    -- A newly saved, meaningful edit supersedes a pending old quiet-hour
    -- snapshot. The same client_id is safe to retry due to message UNIQUE.
    UPDATE v21_private.taphoa_order_edit_quiet_queue q
      SET status='skipped', skip_reason='superseded_by_immediate_edit',updated_at=now()
      WHERE q.order_id=v_order.id AND q.status='pending'
      AND q.client_id IS DISTINCT FROM v_client_id;
  END IF;
  -- NOTICE-282: publication proceeds immediately through the existing
  -- v21_messages insert below, without any quiet-hour scheduling.

$immediate$;
BEGIN
  SELECT pg_get_functiondef('public.taphoa_chat_notify_customer(uuid,uuid,text,text)'::regprocedure)
    INTO src;
  IF position('NOTICE-282: publication proceeds immediately' IN src)>0 THEN RETURN; END IF;
  v_begin:=position(block_start IN src);
  v_end:=position(block_end IN src);
  IF v_begin=0 OR v_end<=v_begin
     OR position('v21_private.taphoa_order_edit_quiet_release(now())' IN src)=0
     OR position('v21_private.chat_outbound_allowed' IN src)=0
     OR position('✏️ Chi tiết sửa:' IN src)=0
  THEN RAISE EXCEPTION 'notice282_event_source_contract_changed'; END IF;
  rewritten:=substring(src FROM 1 FOR v_begin-1)||immediate||substring(src FROM v_end);
  EXECUTE rewritten;
END;
$notice282_immediate$;

DO $notice282_legacy_pending$
DECLARE
  src text;
  rewritten text;
  quiet_gate text := E'IF v_local_time<time ''08:05'' OR v_local_time>=time ''20:00'' THEN\n   RETURN jsonb_build_object(''ok'',true,''status'',''quiet'',''sent'',0);\n END IF;';
BEGIN
  SELECT pg_get_functiondef('v21_private.taphoa_order_edit_quiet_dispatch()'::regprocedure)
    INTO src;
  IF position('NOTICE-282: legacy queue may drain at any hour' IN src)>0 THEN RETURN; END IF;
  IF position(quiet_gate IN src)=0 OR position('q.send_after<=now()' IN src)=0
    OR position('v_job.client_id,v_send_body);' IN src)=0
    OR position('v21_private.chat_outbound_allowed' IN src)=0
    OR position('LIMIT 25 FOR UPDATE SKIP LOCKED' IN src)=0
  THEN RAISE EXCEPTION 'notice282_dispatch_source_contract_changed'; END IF;
  rewritten:=replace(src,quiet_gate,
    '-- NOTICE-282: legacy queue may drain at any hour when explicitly invoked.');
  rewritten:=replace(rewritten,'q.send_after<=now()','q.created_at<=now()');
  EXECUTE rewritten;
END;
$notice282_legacy_pending$;

COMMIT;