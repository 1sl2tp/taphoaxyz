-- CYCLE-196: Once per open debt cycle, notify on the earliest due day.
-- Preserve customer message opt-in; DO NOT retrospectively mass-send reminders
-- for cycles already overdue before this feature was activated.
CREATE TABLE IF NOT EXISTS v21_private.taphoa_cycle_due_notice_log(
 customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 cycle_start_day date NOT NULL,
 client_id text NOT NULL UNIQUE,
 message_id uuid NOT NULL,
 due_day date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(customer_account_id,cycle_start_day)
);
REVOKE ALL ON v21_private.taphoa_cycle_due_notice_log FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_send_due_notices()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE
 v_customer record;
 v jsonb;
 v_due date;
 v_start date;
 v_day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_sender uuid;
 v_id text;
 v_message uuid;
 v_body text;
 v_count integer:=0;
 v_amount numeric;
 v_reason text;
 v_overdue integer;
BEGIN
 FOR v_customer IN
  SELECT a.id,a.display_name FROM public.v21_accounts a
  WHERE a.role='user' AND a.contact_group='customer'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL
 LOOP
  BEGIN
   v:=v21_private.taphoa_cycle_policy_snapshot(v_customer.id);
   IF v IS NULL OR NOT coalesce((v->>'isDue')::boolean,false) THEN CONTINUE; END IF;
   v_due:=(v->>'dueDay')::date;
   v_start:=(v->>'startDay')::date;
   -- Existing historic delinquencies remain visible to Admin but need
   -- review instead of surprise automated backfill into customer Chat.
   IF v_due<date '2026-10-24' THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(
      'taphoa-cycle-due:'||v_customer.id::text||':'||v_start::text,0));
   IF EXISTS(SELECT 1 FROM v21_private.taphoa_cycle_due_notice_log n
     WHERE n.customer_account_id=v_customer.id AND n.cycle_start_day=v_start)
   THEN CONTINUE; END IF;
   -- Recheck after lock: a collection can close the cycle during dispatch.
   v:=v21_private.taphoa_cycle_policy_snapshot(v_customer.id);
   IF v IS NULL OR NOT coalesce((v->>'isDue')::boolean,false)
      OR (v->>'startDay')::date IS DISTINCT FROM v_start THEN CONTINUE; END IF;
   v_overdue:=(v->>'daysOverdue')::integer;
   v_amount:=(v->>'balanceThousands')::numeric;
   v_reason:=v->>'dueReason';
   SELECT a.id INTO v_sender FROM public.v21_accounts a
   WHERE a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
   ORDER BY
     EXISTS(SELECT 1 FROM public.taphoa_orders o
       WHERE o.customer_account_id=v_customer.id AND o.created_by_account_id=a.id
        AND o.status='delivered') DESC,
     a.created_at,a.id
   LIMIT 1;
   IF v_sender IS NULL THEN CONTINUE; END IF;
   v_id:='taphoa:cycle-due:'||md5(v_customer.id::text||':'||v_start::text);
   v_body:='📌 THÔNG BÁO THANH TOÁN · CHU KỲ '||(v->>'cycleNo')
     ||E'\nLần mua gần nhất: '||to_char((v->>'lastPurchaseDay')::date,'DD/MM/YYYY')||'.';
   IF v_reason='stopped_buying' THEN
     v_body:=v_body||E'\nĐã đến mốc 3 ngày kể từ lần mua gần nhất. Điều kiện hỗ trợ chờ đến ngày thứ 7 không còn áp dụng; cần thanh toán toàn bộ công nợ từ '||to_char(v_due,'DD/MM/YYYY')||'.';
   ELSE
     v_body:=v_body||E'\nChu kỳ đã đến mốc 7 ngày. Cần tất toán toàn bộ công nợ từ '||to_char(v_due,'DD/MM/YYYY')||'.';
   END IF;
   v_body:=v_body||E'\n'||CASE WHEN v_overdue>0 THEN
     'Đến hôm nay đã quá hạn '||v_overdue||' ngày.' ELSE 'Hôm nay là ngày đến hạn.' END
     ||E'\nCông nợ cần tất toán: '||public.taphoa_chat_money(v_amount)
     ||E'\nNếu mình đã chuyển khoản, xin gửi chứng từ để bên em đối soát, tránh ghi thu trùng.';
   -- This function honors global + individual customer outbound settings.
   v_message:=public.taphoa_chat_notify_customer(
     v_customer.id,v_sender,v_id,v_body);
   IF v_message IS NOT NULL THEN
     INSERT INTO v21_private.taphoa_cycle_due_notice_log
       (customer_account_id,cycle_start_day,client_id,message_id,due_day)
     VALUES(v_customer.id,v_start,v_id,v_message,v_due)
     ON CONFLICT DO NOTHING;
     v_count:=v_count+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'cycle_notice_send_skipped_for_customer %: %',v_customer.id,SQLERRM;
  END;
 END LOOP;
 RETURN v_count;
END;$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_send_due_notices() FROM PUBLIC,anon,authenticated;
