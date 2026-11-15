-- STAFF-ORDER-014 (2026-11-15): add one independent INTERNAL order notification
-- for the verified Chat/Zalo individual contact "gd me yeu".
-- Exactly one pinned Chat account; never use names, customer PIN links or
-- customer opt-in flags for staff routing. No retrospective dispatch.
-- Source-only migration: production DB must be deployed through approved
-- database change control, never via a frontend/GitHub Pages build.
BEGIN;

-- Detect only actual business changes; updated_at, generated line UUIDs,
-- and snapshots of cost metadata are NOT edit notices.
CREATE OR REPLACE FUNCTION v21_private.taphoa_staff_order_changed(
 p_previous jsonb, p_current jsonb
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'public','v21_private'
AS $changed$
 WITH old_lines AS (
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'code',i->>'product_id',
     'qty',nullif(i->>'qty','')::numeric,
     'price',nullif(i->>'unit_price','')::numeric,
     'note',coalesce(i->>'note',''),
     'line',coalesce(nullif(i->>'line_no',''),nullif(i->>'lineNo',''))::integer
   ) ORDER BY
     coalesce(nullif(i->>'line_no',''),nullif(i->>'lineNo',''))::integer,
     i->>'product_id'),'[]'::jsonb) AS value
   FROM jsonb_array_elements(coalesce(p_previous->'items','[]'::jsonb)) i
 ), new_lines AS (
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'code',i->>'product_id',
     'qty',nullif(i->>'qty','')::numeric,
     'price',nullif(i->>'unit_price','')::numeric,
     'note',coalesce(i->>'note',''),
     'line',coalesce(nullif(i->>'line_no',''),nullif(i->>'lineNo',''))::integer
   ) ORDER BY
     coalesce(nullif(i->>'line_no',''),nullif(i->>'lineNo',''))::integer,
     i->>'product_id'),'[]'::jsonb) AS value
   FROM jsonb_array_elements(coalesce(p_current->'items','[]'::jsonb)) i
 )
 SELECT p_previous IS NULL OR p_current IS NULL
   OR coalesce(p_previous->>'status','') IS DISTINCT FROM coalesce(p_current->>'status','')
   OR coalesce(p_previous->>'customer_id','') IS DISTINCT FROM coalesce(p_current->>'customer_id','')
   OR coalesce(p_previous->>'note','') IS DISTINCT FROM coalesce(p_current->>'note','')
   OR old_lines.value IS DISTINCT FROM new_lines.value
 FROM old_lines CROSS JOIN new_lines;
$changed$;

REVOKE ALL ON FUNCTION v21_private.taphoa_staff_order_changed(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_staff_order_notify(
 p_sender_account_id uuid,
 p_command_id uuid,
 p_order jsonb,
 p_previous jsonb DEFAULT NULL::jsonb,
 p_action text DEFAULT 'create'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private'
AS $staff_notify$
DECLARE
 v_ctx jsonb := public.taphoa_access_context();
 -- Stable recipient verified from Chat accounts + Zalo user link on 15 Nov 2026.
 -- This is an individual Chat user in contact_group=friend, NOT a customer/group.
 v_staff_id constant uuid := '57fc1306-7030-4955-b174-afffeee2c3d2'::uuid;
 v_member_a uuid;
 v_member_b uuid;
 v_conversation_id uuid;
 v_message_id uuid;
 v_client_id text;
 v_code text := left(coalesce(nullif(p_order->>'displayCode',''),'Đơn hàng'),32);
 v_name text;
 v_body text;
 v_action_label text;
 v_item jsonb;
 v_item_name text;
 v_item_count integer := 0;
 v_total_count integer := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
 v_qty numeric;
 v_unit_price numeric;
 v_note text;
 v_changes text;
BEGIN
 IF p_command_id IS NULL OR p_order IS NULL
    OR nullif(p_order->>'id','') IS NULL
    OR p_action NOT IN ('create','edit','deliver') THEN
   RAISE EXCEPTION 'staff_order_notice_invalid_argument' USING errcode='22023';
 END IF;
 -- Not a public messenger RPC: even a leaked function name cannot broadcast
 -- to the employee. Only a current, authorized TAPHOA admin may originate it.
 IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role' IS DISTINCT FROM 'admin'
    OR nullif(v_ctx->>'account_id','') IS DISTINCT FROM p_sender_account_id::text
    OR NOT EXISTS(
      SELECT 1 FROM public.v21_accounts a
      WHERE a.id=p_sender_account_id AND a.role='admin'
        AND a.deleted_at IS NULL AND a.locked_at IS NULL
    ) THEN
   RAISE EXCEPTION 'staff_order_notice_admin_only' USING errcode='42501';
 END IF;
 -- Fail closed for an invalid/deactivated target. Never fall back to a
 -- similarly named Zalo group or another contact.
 IF NOT EXISTS (
   SELECT 1 FROM public.v21_accounts a
   WHERE a.id=v_staff_id AND a.role='user' AND a.contact_group='friend'
     AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RETURN NULL; END IF;

 v_client_id := 'taphoa:' || p_command_id::text || ':staff-order';
 v_action_label := CASE p_action
   WHEN 'create' THEN '🆕 TẠO ĐƠN'
   WHEN 'edit' THEN '✏️ SỬA ĐƠN'
   ELSE '✅ CHUYỂN ĐƠN ĐÃ GIAO' END;
 v_name := CASE
   WHEN nullif(p_order->>'customer_id','') IS NULL THEN 'Chưa chọn khách (khách lẻ)'
   ELSE left(coalesce(nullif(p_order->>'tenKH',''),'Khách hàng'),90)
 END;
 v_body := '📋 THÔNG BÁO ĐƠN CHO NHÂN VIÊN' || E'\n'
   || v_action_label || ' · ' || v_code || E'\n'
   || 'Khách: ' || v_name || E'\n'
   || 'Trạng thái: ' ||
      CASE WHEN p_order->>'status'='done' THEN 'Đã giao' ELSE 'Đơn tạm' END || E'\n'
   || 'Lúc: ' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'DD/MM/YYYY HH24:MI') || E'\n';

 IF p_action='edit' AND p_previous IS NOT NULL THEN
   v_changes:=public.taphoa_chat_order_diff(p_previous,p_order,6);
   IF btrim(coalesce(v_changes,''))<>'' THEN
     v_body:=v_body||'Thay đổi:'||E'\n'||left(v_changes,800)||E'\n';
   END IF;
   IF coalesce(p_previous->>'customer_id','')
        IS DISTINCT FROM coalesce(p_order->>'customer_id','') THEN
     v_body:=v_body||'Đổi khách: '
       ||left(coalesce(nullif(p_previous->>'tenKH',''),'Chưa chọn'),50)
       ||' → '||v_name||E'\n';
   END IF;
   IF coalesce(p_previous->>'note','')
        IS DISTINCT FROM coalesce(p_order->>'note','') THEN
     v_body:=v_body||'Đổi ghi chú: '
       ||left(coalesce(nullif(p_previous->>'note',''),'(trống)'),70)
       ||' → '||left(coalesce(nullif(p_order->>'note',''),'(trống)'),70)||E'\n';
   END IF;
 END IF;

 v_body:=v_body||'Chi tiết ('||v_total_count||' dòng):';
 FOR v_item IN
   SELECT item FROM jsonb_array_elements(coalesce(p_order->'items','[]'::jsonb)) item
   ORDER BY coalesce(nullif(item->>'line_no',''),nullif(item->>'lineNo',''))::integer,
            item->>'product_id'
 LOOP
   v_item_count:=v_item_count+1;
   IF v_item_count>18 THEN EXIT; END IF;
   v_qty:=coalesce(nullif(v_item->>'qty','')::numeric,0);
   v_unit_price:=coalesce(nullif(v_item->>'unit_price','')::numeric,0);
   v_item_name:=left(coalesce(nullif(btrim(v_item->>'tenSP'),''),
                         nullif(btrim(v_item->>'product_name'),''),
                         nullif(btrim(v_item->>'ten'),''),'Sản phẩm'),62);
   v_body:=v_body||E'\n'
     ||v_item_count::text||'. '||v_item_name||' ×'
     ||public.taphoa_chat_qty(v_qty)||' · '
     ||public.taphoa_chat_money(v_qty*v_unit_price);
   v_note:=left(btrim(coalesce(v_item->>'note','')),45);
   IF v_note<>'' THEN v_body:=v_body||' ('||v_note||')'; END IF;
 END LOOP;
 IF v_total_count>18 THEN
   v_body:=v_body||E'\n'||'… và '||(v_total_count-18)::text||' dòng khác.';
 END IF;
 IF btrim(coalesce(p_order->>'note',''))<>'' THEN
   v_body:=v_body||E'\n'||'Ghi chú: '||left(p_order->>'note',140);
 END IF;
 v_body:=v_body||E'\n'||'Tổng đơn: '
   ||public.taphoa_chat_money(coalesce(nullif(p_order->>'tongTien','')::numeric,0));
 IF p_action='edit' AND p_previous IS NOT NULL
    AND coalesce(nullif(p_previous->>'tongTien','')::numeric,0)
       IS DISTINCT FROM coalesce(nullif(p_order->>'tongTien','')::numeric,0) THEN
   v_body:=v_body||' (trước: '
     ||public.taphoa_chat_money(coalesce(nullif(p_previous->>'tongTien','')::numeric,0))
     ||')';
 END IF;
 -- No customer mini-app link or PIN is shared to staff. Keep the message
 -- bounded for the existing Chat/Zalo relay; the footer always has total.
 IF char_length(v_body)>4400 THEN
   -- Preserve the total footer even when line descriptions are shortened.
   v_body:=left(v_body,3900)||E'\n'||'[Còn chi tiết khác trong TAPHOA]'
     ||E'\n'||'Tổng đơn: '
     ||public.taphoa_chat_money(coalesce(nullif(p_order->>'tongTien','')::numeric,0));
 END IF;

 -- Same active-conversation rule as customer helper; never create a group.
 SELECT c.id INTO v_conversation_id
 FROM public.v21_conversations c
 LEFT JOIN LATERAL (
   SELECT max(m.created_at) latest_at
   FROM public.v21_messages m
   WHERE m.conversation_id=c.id AND m.deleted_at IS NULL
     AND m.client_id NOT LIKE 'taphoa:%'
 ) activity ON true
 WHERE (c.member_a=p_sender_account_id AND c.member_b=v_staff_id)
    OR (c.member_b=p_sender_account_id AND c.member_a=v_staff_id)
 ORDER BY activity.latest_at DESC NULLS LAST,c.created_at DESC,c.id
 LIMIT 1;
 IF v_conversation_id IS NULL THEN
   IF p_sender_account_id::text < v_staff_id::text THEN
     v_member_a:=p_sender_account_id;v_member_b:=v_staff_id;
   ELSE
     v_member_a:=v_staff_id;v_member_b:=p_sender_account_id;
   END IF;
   INSERT INTO public.v21_conversations(member_a,member_b)
   VALUES (v_member_a,v_member_b)
   ON CONFLICT(member_a,member_b)
   DO UPDATE SET member_a=excluded.member_a
   RETURNING id INTO v_conversation_id;
 END IF;

 INSERT INTO public.v21_messages(
   conversation_id,sender_account_id,client_id,body
 ) VALUES(v_conversation_id,p_sender_account_id,v_client_id,v_body)
 ON CONFLICT ON CONSTRAINT v21_messages_sender_account_id_client_id_key
 DO NOTHING
 RETURNING id INTO v_message_id;
 IF v_message_id IS NULL THEN
   SELECT id INTO v_message_id
   FROM public.v21_messages
   WHERE sender_account_id=p_sender_account_id AND client_id=v_client_id
   LIMIT 1;
 END IF;
 RETURN v_message_id;
END;
$staff_notify$;

-- Must remain non-public even though the callee is SECURITY DEFINER.
REVOKE ALL ON FUNCTION v21_private.taphoa_staff_order_notify(
 uuid,uuid,jsonb,jsonb,text
) FROM PUBLIC, anon, authenticated;

-- Patch only the LIVE canonical writers, preserving every original money,
-- debt, customer notification/opt-in and order-validation rule.
DO $patch_save$
DECLARE
  v_src text;
  v_anchor text :=
    '  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,''save_order'',v_result);';
  v_call text := $call$
  -- STAFF-ORDER-014: independent staff copy; customer filtering stays above.
  if v_role='admin'
     and v21_private.taphoa_staff_order_changed(v_old_order_json,v_order_json) then
    perform v21_private.taphoa_staff_order_notify(
      v_account_id,p_command_id,v_order_json,v_old_order_json,
      case when v_edit_id is null then 'create'
           when v_old_status='pending' and v_status='delivered' then 'deliver'
           else 'edit' end);
  end if;

$call$;
BEGIN
 SELECT pg_get_functiondef('public.taphoa_save_order(jsonb,uuid)'::regprocedure)
 INTO v_src;
 IF position('STAFF-ORDER-014: independent staff copy' IN v_src)>0 THEN RETURN; END IF;
 IF position(v_anchor IN v_src)=0
   OR position('v_role=''admin'' and v_customer is not null and v_status=''delivered''' IN v_src)=0
   OR position('public.taphoa_chat_notify_customer' IN v_src)=0
   OR position('v_old_order_json' IN v_src)=0 THEN
   RAISE EXCEPTION 'staff_order_save_contract_changed';
 END IF;
 IF length(v_src)-length(replace(v_src,v_anchor,''))<>length(v_anchor) THEN
   RAISE EXCEPTION 'staff_order_save_anchor_not_unique';
 END IF;
 EXECUTE replace(v_src,v_anchor,v_call||v_anchor);
END;
$patch_save$;

DO $patch_deliver$
DECLARE
  v_src text;
  v_anchor text :=
    '  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,''deliver_order'',v_result);';
  v_call text := $call$
  -- STAFF-ORDER-014: also cover the separate "deliver pending order" RPC.
  perform v21_private.taphoa_staff_order_notify(
    (ctx->>'account_id')::uuid,p_command_id,v_order_json,null::jsonb,'deliver');

$call$;
BEGIN
 SELECT pg_get_functiondef('public.taphoa_deliver_order(uuid,uuid)'::regprocedure)
 INTO v_src;
 IF position('STAFF-ORDER-014: also cover the separate' IN v_src)>0 THEN RETURN; END IF;
 IF position(v_anchor IN v_src)=0
   OR position('public.taphoa_chat_notify_customer' IN v_src)=0
   OR position('public.taphoa_order_frontend_json' IN v_src)=0 THEN
   RAISE EXCEPTION 'staff_order_deliver_contract_changed';
 END IF;
 IF length(v_src)-length(replace(v_src,v_anchor,''))<>length(v_anchor) THEN
   RAISE EXCEPTION 'staff_order_deliver_anchor_not_unique';
 END IF;
 EXECUTE replace(v_src,v_anchor,v_call||v_anchor);
END;
$patch_deliver$;
COMMIT;
