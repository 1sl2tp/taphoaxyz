-- ORDER-NOTIFY-017 — user correction:
-- ĐƠN TẠM: tuyệt đối KHÔNG TỰ ĐỘNG thông báo KH hay "gd me yeu".
-- Chỉ trạng thái ĐÃ GIAO (tạo/giao/sửa) mới tự gửi ảnh theo quyền nhận.
-- Forward-only change. It does not delete messages, resend orders or touch money.
BEGIN;
DO $patch_save$
DECLARE
  src text;
  pending_start int;
  staff_start int;
  old_guard text := E'  if v_role=''admin''\n     and v21_private.taphoa_staff_order_changed(v_old_order_json,v_order_json) then';
  new_guard text := E'  if v_role=''admin'' and v_status=''delivered''\n     and v21_private.taphoa_staff_order_changed(v_old_order_json,v_order_json) then';
BEGIN
  SELECT pg_get_functiondef('public.taphoa_save_order(jsonb,uuid)'::regprocedure)
  INTO src;
  IF position('ORDER-NOTIFY-017: delivered-only staff' in src)>0 THEN RETURN; END IF;
  pending_start := position('  -- ORDER-IMAGE-016: pending selected customer' in src);
  staff_start := position('  -- STAFF-ORDER-014: independent staff copy; customer filtering stays above.' in src);
  IF pending_start=0 OR staff_start<=pending_start
      OR position('v21_private.taphoa_staff_order_changed(v_old_order_json,v_order_json)' in src)=0
      OR position(old_guard in src)=0
      OR length(src)-length(replace(src,old_guard,''))<>length(old_guard)
  THEN RAISE EXCEPTION 'order_notify_017_save_contract_changed'; END IF;

  -- Remove ONLY the later-added draft-customer notification branch.
  src := left(src,pending_start-1)||substr(src,staff_start);
  -- Keep the original staff logic for delivered orders and delivered edits.
  src := replace(src,old_guard,
    E'  -- ORDER-NOTIFY-017: delivered-only staff; pending always silent.\n'
    ||new_guard);
  EXECUTE src;
END;
$patch_save$;

DO $patch_helper$
DECLARE
  src text;
  anchor text := ' v_client_id := ''taphoa:'' || p_command_id::text || '':staff-order'';';
  guard text := E' -- ORDER-NOTIFY-017: defense in depth. Never enqueue draft notices.\n'
       || E' IF coalesce(p_order->>''status'','''') NOT IN (''done'',''delivered'') THEN\n'
       || E'   RETURN NULL;\n'
       || E' END IF;\n';
BEGIN
  SELECT pg_get_functiondef(
    'v21_private.taphoa_staff_order_notify(uuid,uuid,jsonb,jsonb,text)'::regprocedure)
  INTO src;
  IF position('ORDER-NOTIFY-017: defense in depth' in src)>0 THEN RETURN; END IF;
  IF position(anchor in src)=0
     OR position('staff_order_notice_admin_only' in src)=0
     OR position('v_staff_id constant uuid' in src)=0
     OR length(src)-length(replace(src,anchor,''))<>length(anchor)
  THEN RAISE EXCEPTION 'order_notify_017_helper_contract_changed'; END IF;
  EXECUTE replace(src,anchor,guard||anchor);
END;
$patch_helper$;
COMMIT;
