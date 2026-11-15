-- ORDER-IMAGE-016: one PNG-only Chat notification to selected customer (consent-gated)
-- and an independent PNG-only notice to pinned staff contact gd me yeu.
-- Existing order messages are never rewritten/backfilled. No real messages
-- are emitted when this migration is applied.
BEGIN;

-- The message is an attachment envelope, not a visible text bubble.
-- BEFORE INSERT runs before the existing outbound-Zalo text trigger, which
-- deliberately skips empty bodies; media trigger forwards PNG separately.
CREATE OR REPLACE FUNCTION v21_private.taphoa_order_image_only_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private'
AS $image_only$
BEGIN
 IF NEW.deleted_at IS NULL
   AND NEW.client_id ~ '^taphoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(order|order-edit|deliver|staff-order)$'
   AND EXISTS(SELECT 1 FROM public.v21_accounts a
       WHERE a.id=NEW.sender_account_id AND a.role='admin'
         AND a.deleted_at IS NULL AND a.locked_at IS NULL)
   AND EXISTS(SELECT 1 FROM public.v21_conversations c
       WHERE c.id=NEW.conversation_id
         AND (c.member_a=NEW.sender_account_id OR c.member_b=NEW.sender_account_id))
 THEN
   NEW.body:='';
 END IF;
 RETURN NEW;
END;
$image_only$;
REVOKE ALL ON FUNCTION v21_private.taphoa_order_image_only_message()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS taphoa_order_image_only_before_insert ON public.v21_messages;
CREATE TRIGGER taphoa_order_image_only_before_insert
BEFORE INSERT ON public.v21_messages FOR EACH ROW
EXECUTE FUNCTION v21_private.taphoa_order_image_only_message();

-- Customer image ticket previously discovered a message by parsing its text.
-- Keep the existing legacy lookup intact; ADD an exact command-log ID match
-- for blank, image-only envelopes, so concurrent edits never attach to the
-- wrong order. The existing opt-in, sender, customer and TTL checks stay.
DO $patch_customer_image_ticket$
DECLARE
 src text;
 from_pos int;
 to_pos int;
BEGIN
 SELECT pg_get_functiondef(
   'public.taphoa_order_notice_image_ticket(uuid)'::regprocedure)
 INTO src;
 IF position('ORDER-IMAGE-016: exact committed order' IN src)>0 THEN RETURN; END IF;
 from_pos:=position('  and ('||chr(10)||'    position(' IN src);
 to_pos:=position('  and m.created_at>=greatest(' IN src);
 IF from_pos<1 OR to_pos<=from_pos
    OR position('v21_private.chat_outbound_allowed' IN src)=0
    OR position('taphoa_order_notice_image_uploads' IN src)=0
 THEN RAISE EXCEPTION 'order_image_ticket_contract_changed'; END IF;
 src:=left(src,from_pos-1)||$filter$
  -- ORDER-IMAGE-016: exact committed order; retain legacy text fallback.
  and (
    (m.body='' AND EXISTS (
      SELECT 1 FROM public.taphoa_command_log l
      WHERE l.command_id::text=split_part(m.client_id,':',2)
        AND l.operation IN ('save_order','deliver_order')
        AND l.result->'order'->>'id'=p_order_id::text
    ))
    OR (
      position(' · '||v_code||' · ' in m.body)>0
      or position(' · '||v_code||E'\n' in m.body)>0
    )
  )
$filter$||substr(src,to_pos);
 EXECUTE src;
END;
$patch_customer_image_ticket$;

-- Draft creation/edit for an explicitly selected customer now follows the
-- same opt-in gate as delivered orders. This only dispatches for genuine
-- business changes, never for no-op edits or for an unselected customer.
-- All order/debt computation above the stable staff hook stays unchanged.
DO $patch_pending_customer$
DECLARE
 src text;
 anchor text:='  -- STAFF-ORDER-014: independent staff copy; customer filtering stays above.';
BEGIN
 SELECT pg_get_functiondef('public.taphoa_save_order(jsonb,uuid)'::regprocedure)
 INTO src;
 IF position('ORDER-IMAGE-016: pending selected customer' IN src)>0 THEN RETURN; END IF;
 IF position(anchor IN src)=0
    OR position('v21_private.taphoa_staff_order_changed' IN src)=0
    OR position('public.taphoa_chat_notify_customer' IN src)=0
 THEN RAISE EXCEPTION 'order_save_contract_changed'; END IF;
 EXECUTE replace(src,anchor,$hook$
  -- ORDER-IMAGE-016: pending selected customer uses the normal recipient
  -- permission gate; BEFORE INSERT strips only the automatic order text.
  IF v_role='admin' AND v_customer IS NOT NULL AND v_status='pending'
     AND v21_private.taphoa_staff_order_changed(v_old_order_json,v_order_json) THEN
    PERFORM public.taphoa_chat_notify_customer(
      v_customer,v_account_id,
      'taphoa:'||p_command_id::text||
        CASE WHEN v_edit_id IS NULL THEN ':order' ELSE ':order-edit' END,
      CASE WHEN v_edit_id IS NULL
        THEN 'Đơn tạm '||v_display_code||' được tạo'
        ELSE 'Đơn tạm '||v_display_code||' đã được sửa' END
    );
  END IF;

$hook$||anchor);
END;
$patch_pending_customer$;
COMMIT;
