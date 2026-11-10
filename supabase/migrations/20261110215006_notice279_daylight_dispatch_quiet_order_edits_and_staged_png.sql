
-- NOTICE-279: release only approved edited-order notices after 08:05 ICT.
-- A private queue and row locks deduplicate each order/quiet night. Existing
-- Zalo bridge remains the only sender; no new HTTP or polling owners.
CREATE OR REPLACE FUNCTION v21_private.taphoa_order_edit_quiet_dispatch()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','v21_private','storage','pg_temp'
AS $quiet$
DECLARE
 v_job v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;
 v_order public.taphoa_orders;
 v_message public.v21_messages;
 v_message_id uuid;
 v_sent integer:=0;
 v_skipped integer:=0;
 v_failed integer:=0;
 v_images integer:=0;
 v_images_missing integer:=0;
 v_local_time time:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
BEGIN
 IF v_local_time<time '08:05' OR v_local_time>=time '20:00' THEN
   RETURN jsonb_build_object('ok',true,'status','quiet','sent',0);
 END IF;
 FOR v_job IN
  SELECT * FROM v21_private.taphoa_order_edit_quiet_queue q
  WHERE q.status='pending' AND q.send_after<=now()
    AND q.updated_at<=now()-interval '90 seconds'
  ORDER BY q.send_after,q.updated_at,q.order_id
  LIMIT 25 FOR UPDATE SKIP LOCKED
 LOOP
  BEGIN
   SELECT * INTO v_order FROM public.taphoa_orders o
     WHERE o.id=v_job.order_id;
   IF v_order.id IS NULL OR v_order.status<>'delivered'
      OR v_order.customer_account_id IS DISTINCT FROM v_job.customer_account_id THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='order_changed_or_removed'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   IF NOT v21_private.chat_outbound_allowed(v_job.customer_account_id,v_job.client_id) THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='customer_opted_out'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   -- A morning release is a genuine new Chat message. Only then do the
   -- existing Chat sync, Zalo and media triggers see the notice.
   v_message_id:=public.taphoa_chat_notify_customer(
     v_job.customer_account_id,v_job.sender_account_id,
     v_job.client_id,v_job.body);
   IF v_message_id IS NULL THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='notify_no_longer_allowed'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   SELECT * INTO v_message FROM public.v21_messages WHERE id=v_message_id;
   IF v_message.id IS NULL OR v_message.deleted_at IS NOT NULL
      OR v_message.sender_account_id IS DISTINCT FROM v_job.sender_account_id
      OR v_message.client_id IS DISTINCT FROM v_job.client_id THEN
      RAISE EXCEPTION 'quiet_edit_message_identity_mismatch';
   END IF;
   IF v_job.staged_ready_at IS NOT NULL THEN
     IF v_job.staged_asset_id IS NOT NULL
        AND v_job.staged_storage_key IS NOT NULL
        AND v_job.staged_size_bytes BETWEEN 1 AND 15728640
        AND v_job.staged_width_px BETWEEN 1 AND 20000
        AND v_job.staged_height_px BETWEEN 1 AND 20000
        AND EXISTS (
         SELECT 1 FROM storage.objects o
         JOIN public.v21_accounts a ON a.id=v_job.sender_account_id
         WHERE o.bucket_id='v21-media' AND o.name=v_job.staged_storage_key
          AND o.owner_id=a.auth_user_id::text
          AND o.archived_at IS NULL AND NOT o.is_delete_marker
          AND split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1)='image/png'
          AND coalesce((o.metadata->>'size')::bigint,
                       (o.metadata->>'contentLength')::bigint,0)=v_job.staged_size_bytes
        )
     THEN
       INSERT INTO public.v21_media_assets(
         id,conversation_id,message_id,owner_account_id,kind,mime_type,
         size_bytes,storage_key,width_px,height_px,sort_index)
       VALUES (v_job.staged_asset_id,v_message.conversation_id,
         v_message.id,v_job.sender_account_id,'image','image/png',
         v_job.staged_size_bytes,v_job.staged_storage_key,
         v_job.staged_width_px,v_job.staged_height_px,0)
       ON CONFLICT(id) DO NOTHING;
       v_images:=v_images+1;
     ELSE
       v_images_missing:=v_images_missing+1;
     END IF;
   END IF;
   UPDATE v21_private.taphoa_order_edit_quiet_queue q
     SET status='sent',message_id=v_message.id,sent_at=now(),last_error=NULL
     WHERE q.order_id=v_job.order_id AND q.dispatch_date_vn=v_job.dispatch_date_vn
       AND q.status='pending';
   v_sent:=v_sent+1;
  EXCEPTION WHEN OTHERS THEN
    -- Per-row savepoint: failed image/message never partially commits.
    -- Retry on subsequent daytime cron runs without notifying twice.
    UPDATE v21_private.taphoa_order_edit_quiet_queue q
      SET attempts=attempts+1,last_error=left(SQLERRM,300)
      WHERE q.order_id=v_job.order_id AND q.dispatch_date_vn=v_job.dispatch_date_vn
        AND q.status='pending';
    v_failed:=v_failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('ok',v_failed=0,'status','processed',
   'sent',v_sent,'skipped',v_skipped,'errors',v_failed,
   'images_attached',v_images,'images_missing',v_images_missing);
END;
$quiet$;
REVOKE ALL ON FUNCTION v21_private.taphoa_order_edit_quiet_dispatch()
 FROM PUBLIC,anon,authenticated;

DO $cron$
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='taphoa-order-edit-after-0805-vn') THEN
  RAISE EXCEPTION 'quiet_edit_cron_already_exists_review_before_update';
 END IF;
 PERFORM cron.schedule('taphoa-order-edit-after-0805-vn',
   '5,15,25,35,45,55 1-12 * * *',
   'SELECT v21_private.taphoa_order_edit_quiet_dispatch();');
END;
$cron$;
