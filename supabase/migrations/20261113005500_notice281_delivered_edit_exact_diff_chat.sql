-- NOTICE-281: preserve exact old→new delivered-order edits in Chat messages.
-- Keep approved quiet hours 20:00–08:05 VN. No direct message, ledger,
-- order, customer, or queue row changes when this migration runs.
-- Existing queued messages get their delta from immutable saved command
-- snapshots only at normal daylight dispatch; no extra sender/cron.
BEGIN;
DO $notice281_preserve_edit_delta$
DECLARE
 src text;
 changed text;
 anchor text := 'v_body := public.taphoa_chat_order_receipt(v_order_json,''Cập nhật'',null);';
 replacement text := $replace_notify$
v_body := public.taphoa_chat_order_receipt(v_order_json,'Cập nhật',null)
 || CASE WHEN position(chr(10) IN replace(v_body,E'\\n',chr(10)))>0
   THEN chr(10)||chr(10)||'✏️ Chi tiết sửa:'||chr(10)
     ||left(substr(replace(v_body,E'\\n',chr(10)),
       position(chr(10) IN replace(v_body,E'\\n',chr(10)))+1),1400)
   ELSE '' END;
$replace_notify$;
BEGIN
 SELECT pg_get_functiondef('public.taphoa_chat_notify_customer(uuid,uuid,text,text)'::regprocedure) INTO src;
 IF position('✏️ Chi tiết sửa:' IN src)>0 THEN RETURN; END IF;
 IF position(anchor IN src)=0 OR position('v21_private.chat_outbound_allowed' IN src)=0
   OR position('taphoa_order_edit_quiet_release(now())' IN src)=0
 THEN RAISE EXCEPTION 'notice281_notify_contract_changed'; END IF;
 changed:=replace(src,anchor,replacement);
 EXECUTE changed;
END;
$notice281_preserve_edit_delta$;

DO $notice281_enrich_existing_queue$
DECLARE
 src text;
 changed text;
 declare_anchor text := 'v_job v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;';
 call_anchor text := 'v_message_id:=public.taphoa_chat_notify_customer(';
 body_anchor text := 'v_job.client_id,v_job.body);';
 declarations text := $vars$
v_job v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;
 v_latest_snapshot jsonb;
 v_previous_snapshot jsonb;
 v_change_details text;
 v_send_body text;
$vars$;
 detail text := $detail$
   -- Do not edit a queued row or send early; enrich its original payload
   -- at its pre-existing 08:05+ dispatch from two recorded order snapshots.
   v_send_body:=v_job.body;
   IF position('✏️ Chi tiết sửa:' IN v_send_body)=0
     AND position('✏️ Thay đổi:' IN v_send_body)=0 THEN
     SELECT x.o INTO v_latest_snapshot
     FROM (SELECT c.result->'order' o FROM public.taphoa_command_log c
       WHERE c.operation='save_order'
         AND c.result->'order'->>'id'=v_job.order_id::text
       ORDER BY c.created_at DESC LIMIT 1) x;
     SELECT x.o INTO v_previous_snapshot
     FROM (SELECT c.result->'order' o FROM public.taphoa_command_log c
       WHERE c.operation='save_order'
         AND c.result->'order'->>'id'=v_job.order_id::text
       ORDER BY c.created_at DESC OFFSET 1 LIMIT 1) x;
     IF v_previous_snapshot IS NOT NULL AND v_latest_snapshot IS NOT NULL THEN
       v_change_details:=public.taphoa_chat_order_diff(
         v_previous_snapshot,v_latest_snapshot,6);
       IF btrim(coalesce(v_change_details,''))<>'' THEN
         v_send_body:=v_send_body||chr(10)||chr(10)||'✏️ Thay đổi:'
           ||chr(10)||left(v_change_details,1000);
         IF coalesce(v_previous_snapshot->>'tongTien','')
           IS DISTINCT FROM coalesce(v_latest_snapshot->>'tongTien','') THEN
           v_send_body:=v_send_body||chr(10)||'Tổng: '
             ||public.taphoa_chat_money(coalesce(nullif(v_previous_snapshot->>'tongTien','')::numeric,0))
             ||' → '
             ||public.taphoa_chat_money(coalesce(nullif(v_latest_snapshot->>'tongTien','')::numeric,0));
         END IF;
       END IF;
     END IF;
   END IF;
$detail$;
BEGIN
 SELECT pg_get_functiondef('v21_private.taphoa_order_edit_quiet_dispatch()'::regprocedure) INTO src;
 IF position('✏️ Thay đổi:' IN src)>0 THEN RETURN; END IF;
 IF position(declare_anchor IN src)=0 OR position(call_anchor IN src)=0
   OR position(body_anchor IN src)=0 OR position('v_local_time<time ''08:05''' IN src)=0
 THEN RAISE EXCEPTION 'notice281_dispatch_contract_changed'; END IF;
 changed:=replace(src,declare_anchor,declarations);
 changed:=replace(changed,call_anchor,detail||chr(10)||call_anchor);
 changed:=replace(changed,body_anchor,'v_job.client_id,v_send_body);');
 EXECUTE changed;
END;
$notice281_enrich_existing_queue$;
COMMIT;