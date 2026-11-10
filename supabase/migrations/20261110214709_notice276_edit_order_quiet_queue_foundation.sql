
-- NOTICE-276: quiet hours for edited delivered-order business notices.
-- The order/ledger is committed immediately; only Chat/Zalo notification
-- publication is deferred until 08:05 Asia/Ho_Chi_Minh.
CREATE TABLE IF NOT EXISTS v21_private.taphoa_order_edit_quiet_queue(
 order_id uuid NOT NULL,
 dispatch_date_vn date NOT NULL,
 customer_account_id uuid NOT NULL,
 sender_account_id uuid NOT NULL,
 client_id text NOT NULL,
 body text NOT NULL,
 send_after timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','sent','skipped')),
 message_id uuid,
 sent_at timestamptz,
 skip_reason text,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 staged_asset_id uuid,
 staged_conversation_id uuid,
 staged_storage_key text,
 staged_size_bytes bigint,
 staged_width_px integer,
 staged_height_px integer,
 staged_ready_at timestamptz,
 PRIMARY KEY(order_id,dispatch_date_vn),
 CHECK(char_length(client_id) BETWEEN 12 AND 120),
 CHECK(char_length(body) BETWEEN 1 AND 8000)
);
CREATE UNIQUE INDEX IF NOT EXISTS taphoa_quiet_edit_asset_unique
 ON v21_private.taphoa_order_edit_quiet_queue(staged_asset_id)
 WHERE staged_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS taphoa_quiet_edit_due_idx
 ON v21_private.taphoa_order_edit_quiet_queue(send_after,updated_at)
 WHERE status='pending';
REVOKE ALL ON TABLE v21_private.taphoa_order_edit_quiet_queue
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_order_edit_quiet_release(p_at timestamptz)
 RETURNS timestamptz
 LANGUAGE sql IMMUTABLE SECURITY INVOKER
 SET search_path TO 'pg_catalog'
AS $quiet$
 SELECT CASE
  WHEN (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= time '20:00'
  THEN ((p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+1+time '08:05')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHEN (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < time '08:00'
  THEN ((p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+time '08:05')
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ELSE null::timestamptz
 END;
$quiet$;
REVOKE ALL ON FUNCTION v21_private.taphoa_order_edit_quiet_release(timestamptz)
 FROM PUBLIC,anon,authenticated;
