-- NOTICE-283: retire ONLY the 08:05 quiet-hour edit notification cron
-- after NOTICE-282 has switched delivered-order edit events to immediate
-- dispatch AND all legacy queued edits have been sent or safely skipped.
-- Does not touch bank reporting 08:05, payment ACKs, 06:00 price group,
-- cycle reminders, retention jobs, technical workers, Zalo keepalive.
BEGIN;
DO $notice283$
BEGIN
 IF position('NOTICE-282: publication proceeds immediately' IN
    pg_get_functiondef('public.taphoa_chat_notify_customer(uuid,uuid,text,text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'notice283_immediate_sender_not_deployed'; END IF;
 IF EXISTS(SELECT 1 FROM v21_private.taphoa_order_edit_quiet_queue q
    WHERE q.status='pending')
 THEN RAISE EXCEPTION 'notice283_pending_messages_must_be_drained'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='taphoa-order-edit-after-0805-vn') THEN
   PERFORM cron.unschedule('taphoa-order-edit-after-0805-vn');
 END IF;
END;
$notice283$;
COMMIT;