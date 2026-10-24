-- CYCLE-197: Polite and role-correct personalized cycle reminders.
-- All automatic customer messages honor global/customer debt notification opt-in.
-- Due reminders remain one per open cycle. Pre-due reminders are also one per cycle.
-- No historical catch-up blast; no direct financial ledger writes.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_address(p_name text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE v text:=btrim(coalesce(p_name,'')); v_rest text;
BEGIN
  IF v ~* '^(cô|chú|bác)[[:space:]]+' THEN
    RETURN jsonb_build_object('name',v,'speaker','cháu');
  END IF;
  IF v ~* '^A[[:space:]]+' THEN
    v_rest:=btrim(substring(v from 2));
    RETURN jsonb_build_object('name','Anh '||v_rest,'speaker','em');
  ELSIF v ~* '^C[[:space:]]+' THEN
    v_rest:=btrim(substring(v from 2));
    RETURN jsonb_build_object('name','Chị '||v_rest,'speaker','em');
  ELSIF v ~* '^E[[:space:]]+' THEN
    v_rest:=btrim(substring(v from 2));
    RETURN jsonb_build_object('name','Em '||v_rest,'speaker','chị');
  END IF;
  RETURN jsonb_build_object('name',coalesce(nullif(v,''),'Anh/chị'),'speaker','em');
END; $$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_address(text) FROM PUBLIC,anon,authenticated;

-- Hold customer-facing reminders when THAT customer has fresh, unresolved
-- transfer evidence (never assume unassigned bank credits belong to them).
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_payment_pending(p_customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_bank_bill_receipts r
    WHERE r.customer_account_id=p_customer
      AND r.ledger_id IS NULL
      AND r.status IN ('amount_read','review')
      AND r.created_at >= now()-interval '72 hours'
      AND r.created_at<=now()
  );
$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_payment_pending(uuid) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS v21_private.taphoa_cycle_pre_due_notice_log(
 customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 cycle_start_day date NOT NULL,
 due_day date NOT NULL,
 client_id text NOT NULL UNIQUE,
 message_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (customer_account_id,cycle_start_day)
);
REVOKE ALL ON v21_private.taphoa_cycle_pre_due_notice_log FROM PUBLIC,anon,authenticated;

-- One gentle heads-up on the day before the EARLIEST due milestone.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_send_pre_due_notices()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE
 c record; v jsonb; addr jsonb; v_day date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 v_due date; v_start date; v_sender uuid; v_id text; v_body text;
 v_msg uuid; v_amount numeric; v_count integer:=0; v_label text;
BEGIN
 FOR c IN SELECT id,display_name FROM public.v21_accounts
  WHERE role='user' AND contact_group='customer' AND deleted_at IS NULL AND locked_at IS NULL
 LOOP
  BEGIN
   v:=v21_private.taphoa_cycle_policy_snapshot(c.id);
   IF v IS NULL OR coalesce((v->>'isDue')::boolean,false) THEN CONTINUE; END IF;
   v_due:=(v->>'dueDay')::date; v_start:=(v->>'startDay')::date;
   IF v_due IS NULL OR v_due<>v_day+1 OR v_due<date '2026-10-25'
      OR coalesce((v->>'balanceThousands')::numeric,0)<=0 THEN CONTINUE; END IF;
   IF v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('cycle-pre:'||c.id||':'||v_start,0));
   IF EXISTS(SELECT 1 FROM v21_private.taphoa_cycle_pre_due_notice_log h
     WHERE h.customer_account_id=c.id AND h.cycle_start_day=v_start) THEN CONTINUE; END IF;
   -- Refresh after lock; collections, deliveries, and new evidence can change eligibility.
   v:=v21_private.taphoa_cycle_policy_snapshot(c.id);
   IF v IS NULL OR coalesce((v->>'isDue')::boolean,false)
    OR (v->>'startDay')::date IS DISTINCT FROM v_start
    OR (v->>'dueDay')::date IS DISTINCT FROM v_due
    OR v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   SELECT id INTO v_sender FROM public.v21_accounts
    WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL
    ORDER BY created_at,id LIMIT 1;
   IF v_sender IS NULL THEN CONTINUE; END IF;
   addr:=v21_private.taphoa_cycle_address(c.display_name);
   v_amount:=(v->>'balanceThousands')::numeric;
   v_label:=CASE WHEN v->>'dueReason'='stopped_buying'
    THEN 'Nếu hôm nay mình vẫn không nhập thêm hàng, đến ngày mai sẽ đủ 3 ngày liên tiếp không mua và cần thanh toán theo chính sách.'
    ELSE 'Ngày mai là ngày thứ 7 của chu kỳ và là hạn tất toán toàn bộ, dù mình vẫn nhập hàng.' END;
   v_body:=(addr->>'name')||' ơi, '||(addr->>'speaker')
     ||' xin phép nhắc mình về hạn thanh toán chu kỳ '||(v->>'cycleNo')||' ạ.'
     ||chr(10)||v_label
     ||chr(10)||'Hạn dự kiến: '||to_char(v_due,'DD/MM/YYYY')||'.'
     ||chr(10)||'Công nợ hiện tại: '||public.taphoa_chat_money(v_amount)||'.'
     ||chr(10)||'Nếu mình đã chuyển khoản, vui lòng gửi bill để bên '
       ||(addr->>'speaker')||' kiểm tra trước khi nhắc tiếp. '
       ||'Cảm ơn '||(addr->>'name')||' ạ!';
   v_id:='taphoa:cycle-pre:'||md5(c.id::text||':'||v_start::text)||':debt';
   v_msg:=public.taphoa_chat_notify_customer(c.id,v_sender,v_id,v_body);
   IF v_msg IS NOT NULL THEN
    INSERT INTO v21_private.taphoa_cycle_pre_due_notice_log
      (customer_account_id,cycle_start_day,due_day,client_id,message_id)
    VALUES(c.id,v_start,v_due,v_id,v_msg) ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'cycle_pre_notice_skipped %: %',c.id,SQLERRM;
  END;
 END LOOP;
 RETURN v_count;
END;$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_send_pre_due_notices() FROM PUBLIC,anon,authenticated;

-- Replace generic due text with the customer's actual form of address.
-- An unresolved bill temporarily pauses customer reminders, but not Admin alerts.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_send_due_notices()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE
 c record; v jsonb; addr jsonb; v_due date; v_start date;
 v_today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 v_sender uuid; v_id text; v_msg uuid; v_body text;
 v_count integer:=0; v_amount numeric; v_overdue integer;
BEGIN
 FOR c IN SELECT a.id,a.display_name FROM public.v21_accounts a
  WHERE a.role='user' AND a.contact_group='customer'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL
 LOOP
  BEGIN
   v:=v21_private.taphoa_cycle_policy_snapshot(c.id);
   IF v IS NULL OR NOT coalesce((v->>'isDue')::boolean,false) THEN CONTINUE; END IF;
   v_due:=(v->>'dueDay')::date; v_start:=(v->>'startDay')::date;
   IF v_due<date '2026-10-24' OR v_due>v_today
    OR coalesce((v->>'balanceThousands')::numeric,0)<=0
    OR v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-cycle-due:'||c.id||':'||v_start,0));
   IF EXISTS(SELECT 1 FROM v21_private.taphoa_cycle_due_notice_log h
    WHERE h.customer_account_id=c.id AND h.cycle_start_day=v_start) THEN CONTINUE; END IF;
   v:=v21_private.taphoa_cycle_policy_snapshot(c.id);
   IF v IS NULL OR NOT coalesce((v->>'isDue')::boolean,false)
     OR (v->>'startDay')::date IS DISTINCT FROM v_start
     OR v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   v_amount:=(v->>'balanceThousands')::numeric;
   v_overdue:=(v->>'daysOverdue')::integer;
   SELECT id INTO v_sender FROM public.v21_accounts
    WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL
    ORDER BY created_at,id LIMIT 1;
   IF v_sender IS NULL THEN CONTINUE; END IF;
   addr:=v21_private.taphoa_cycle_address(c.display_name);
   v_body:=(addr->>'name')||' ơi, '||(addr->>'speaker')
     ||' xin phép nhắc công nợ chu kỳ '||(v->>'cycleNo')||' ạ.'
     ||chr(10)||CASE WHEN v->>'dueReason'='stopped_buying'
      THEN 'Mình đã ngừng nhập hàng đủ 3 ngày liên tiếp nên thời gian hỗ trợ thanh toán đến ngày thứ 7 đã kết thúc.'
      ELSE 'Chu kỳ mua hàng đã đến ngày thứ 7, cần tất toán theo chính sách hỗ trợ.' END
     ||chr(10)||'Hạn thanh toán: '||to_char((v->>'dueDay')::date,'DD/MM/YYYY')||'.'
     ||CASE WHEN v_overdue>0 THEN chr(10)||'Đến hôm nay đã quá hạn '||v_overdue||' ngày.' ELSE '' END
     ||chr(10)||'Công nợ còn lại: '||public.taphoa_chat_money(v_amount)||'.'
     ||chr(10)||(addr->>'speaker')||' nhờ mình thu xếp thanh toán giúp. '
       ||'Nếu đã chuyển khoản, mình gửi chứng từ để bên '
       ||(addr->>'speaker')||' đối chiếu, tránh nhắc nhầm. Cảm ơn mình ạ!';
   v_id:='taphoa:cycle-due:'||md5(c.id::text||':'||v_start::text)||':debt';
   v_msg:=public.taphoa_chat_notify_customer(c.id,v_sender,v_id,v_body);
   IF v_msg IS NOT NULL THEN
    INSERT INTO v21_private.taphoa_cycle_due_notice_log
       (customer_account_id,cycle_start_day,client_id,message_id,due_day)
    VALUES(c.id,v_start,v_id,v_msg,v_due)
    ON CONFLICT DO NOTHING;
    v_count:=v_count+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'cycle_due_notice_skipped %: %',c.id,SQLERRM;
  END;
 END LOOP;
 RETURN v_count;
END;$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_send_due_notices() FROM PUBLIC,anon,authenticated;

-- A single daily run. Never backfill customers immediately upon migration.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_send_daily_reminders()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE v_pre integer;v_due integer;
BEGIN
 v_pre:=v21_private.taphoa_cycle_send_pre_due_notices();
 v_due:=v21_private.taphoa_cycle_send_due_notices();
 RETURN jsonb_build_object('pre_due_sent',v_pre,'due_sent',v_due);
END;$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_send_daily_reminders() FROM PUBLIC,anon,authenticated;

-- Reuse the existing 08:00 Vietnam schedule and remove double invocation risk.
SELECT cron.schedule(
 'taphoa-cycle-policy-due-notice-v1',
 '0 1 * * *',
 'select v21_private.taphoa_cycle_send_daily_reminders();'
);
