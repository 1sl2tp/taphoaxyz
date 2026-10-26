
-- CYCLE-20261026: one monthly period = calendar month. One purchase day
-- counts as ONE visit regardless of how many delivered orders; orders are a
-- separate metric. Financial ledger remains continuous across months.
-- Admin-only read RPC already exposed to the production bridge.
CREATE OR REPLACE FUNCTION public.taphoa_debt_cycles()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false)
    or coalesce(ctx->>'taphoa_role','') <> 'admin'
  then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  with running as (
    select l.customer_account_id,l.id,l.created_at,l.order_id,l.entry_type,
      l.amount_vnd,o.delivered_at as delivered_at_for_purchase,
      sum(l.amount_vnd) over (
        partition by l.customer_account_id
        order by l.created_at,l.id rows between unbounded preceding and current row
      ) as balance_after,
      (l.entry_type='sale' and not exists (
        select 1 from public.taphoa_debt_ledger rev
        where rev.order_id=l.order_id and rev.order_id is not null
          and rev.customer_account_id=l.customer_account_id
          and rev.entry_type='reversal'
      )) as is_purchase
    from public.taphoa_debt_ledger l
    left join public.taphoa_orders o on o.id=l.order_id and o.customer_account_id=l.customer_account_id
    join public.v21_accounts a on a.id=l.customer_account_id
      and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null
  ), transitions as (
    select r.*,(r.balance_after-r.amount_vnd) as balance_before,
      case when r.balance_after>0 and r.balance_after-r.amount_vnd<=0 then 1 else 0 end as started,
      case when r.balance_after<=0 and r.balance_after-r.amount_vnd>0 then 1 else 0 end as closed
    from running r
  ), numbered as (
    select t.*,
      sum(t.started) over (
        partition by t.customer_account_id
        order by t.created_at,t.id rows between unbounded preceding and current row
      )::integer as cycle_no
    from transitions t
  ), cycles as (
    select n.customer_account_id,n.cycle_no,
      min(n.created_at) filter(where n.started=1) as started_at,
      min(n.created_at) filter(where n.closed=1) as closed_at,
      count(*) filter(where n.is_purchase)::integer as purchase_count,
      max(coalesce(n.delivered_at_for_purchase,n.created_at)) filter(where n.is_purchase) as last_purchase_at
    from numbered n
    where n.cycle_no>0
    group by n.customer_account_id,n.cycle_no
  ), entries as (
    select c.customer_account_id,c.cycle_no,c.started_at,c.closed_at,
      c.purchase_count,c.last_purchase_at,
      (c.started_at at time zone 'Asia/Ho_Chi_Minh')::date as start_day,
      (c.closed_at at time zone 'Asia/Ho_Chi_Minh')::date as close_day,
      (coalesce(c.closed_at,now()) at time zone 'Asia/Ho_Chi_Minh')::date as end_day,
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date -
       (coalesce(c.last_purchase_at,c.started_at) at time zone 'Asia/Ho_Chi_Minh')::date)::integer as days_without_purchase
    from cycles c
  ), aggregated as (
    select e.customer_account_id,
      jsonb_agg(jsonb_build_object(
        'number',e.cycle_no,
        'startedAt',e.started_at,
        'closedAt',e.closed_at,
        'startDay',to_char(e.start_day,'YYYY-MM-DD'),
        'endDay',case when e.closed_at is null then null else to_char(e.close_day,'YYYY-MM-DD') end,
        'purchaseCount',e.purchase_count,
        'lastPurchaseAt',e.last_purchase_at,
        'durationDays',greatest(1,e.end_day-e.start_day+1),
        'daysWithoutPurchase',greatest(0,e.days_without_purchase),
        'daysToSeven',case when e.closed_at is not null then 0 else greatest(0,7-(e.end_day-e.start_day+1)) end,
        'daysOverSeven',case when e.closed_at is not null then greatest(0,e.end_day-e.start_day+1-7)
          else greatest(0,e.end_day-e.start_day+1-7) end,
        'threeDayStop',e.closed_at is null and coalesce(
  (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'isDue')::boolean,false)
  and (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'dueReason')='stopped_buying',
  'policyDueDay',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'dueDay' else null end,
  'policyReason',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'dueReason' else null end,
  'policyDaysOverdue',case when e.closed_at is null
    then (v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'daysOverdue')::integer else 0 end,
  'policyIsDue',case when e.closed_at is null
    then coalesce((v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'isDue')::boolean,false) else false end,
  'policyFirstGapDay',case when e.closed_at is null
    then v21_private.taphoa_cycle_policy_snapshot(e.customer_account_id)->>'firstGapDay' else null end,
  'policyPendingEvidence',case when e.closed_at is null
    then v21_private.taphoa_cycle_payment_pending(e.customer_account_id) else false end
      ) order by e.cycle_no) as history
    from entries e
    group by e.customer_account_id
  ), valid_month_purchases as (
    -- A buying day is one visit no matter how many delivered orders were
    -- posted; orders count separately. Reversed sales are excluded.
    select l.customer_account_id,
      date_trunc('month',coalesce(o.delivered_at,l.created_at)
        at time zone 'Asia/Ho_Chi_Minh')::date as month_start,
      count(distinct (coalesce(o.delivered_at,l.created_at)
        at time zone 'Asia/Ho_Chi_Minh')::date)::integer as purchase_days,
      count(distinct l.order_id)::integer as order_count
    from public.taphoa_debt_ledger l
    join public.taphoa_orders o on o.id=l.order_id
      and o.customer_account_id=l.customer_account_id
    where l.entry_type='sale'
      and not exists(select 1 from public.taphoa_debt_ledger rev
        where rev.customer_account_id=l.customer_account_id
          and rev.order_id=l.order_id and rev.entry_type='reversal')
      and (coalesce(o.delivered_at,l.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
        >= ((date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date
          - interval '5 months')::date)
    group by 1,2
  ), ledger_month_totals as (
    -- Financial truth stays in ledger and is never reset on the 1st.
    select l.customer_account_id,
      date_trunc('month',l.created_at at time zone 'Asia/Ho_Chi_Minh')::date as month_start,
      sum(l.amount_vnd) as delta
    from public.taphoa_debt_ledger l group by 1,2
  ), reporting_months as (
    select a.id customer_account_id,
      (date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date
        - (n.i || ' months')::interval)::date month_start
    from public.v21_accounts a cross join generate_series(0,5) n(i)
    where a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ), monthly_rows as (
    select m.customer_account_id,m.month_start,
      coalesce(p.purchase_days,0) purchase_days,
      coalesce(p.order_count,0) order_count,
      coalesce((select sum(t.delta) from ledger_month_totals t
        where t.customer_account_id=m.customer_account_id
          and t.month_start<m.month_start),0) as opening_balance,
      coalesce((select sum(t.delta) from ledger_month_totals t
        where t.customer_account_id=m.customer_account_id
          and t.month_start<=m.month_start),0) as closing_balance
    from reporting_months m
    left join valid_month_purchases p on p.customer_account_id=m.customer_account_id
      and p.month_start=m.month_start
  ), monthly_json as (
    select m.customer_account_id,
      jsonb_agg(jsonb_build_object(
        'month',to_char(m.month_start,'YYYY-MM'),
        'purchaseDays',m.purchase_days,
        'orderCount',m.order_count,
        'openingBalance',m.opening_balance,
        'closingBalance',m.closing_balance,
        'carryOver',greatest(0,m.opening_balance)
      ) order by m.month_start desc) as months
    from monthly_rows m group by m.customer_account_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId',a.id,
    'cycles',coalesce(g.history,'[]'::jsonb),
    'monthly',coalesce(mj.months,'[]'::jsonb)
  ) order by a.display_name,a.id),'[]'::jsonb)
  into result
  from public.v21_accounts a
  left join aggregated g on g.customer_account_id=a.id
  left join monthly_json mj on mj.customer_account_id=a.id
  where a.role='user' and a.contact_group='customer' and a.deleted_at is null
    and a.locked_at is null;

  return result;
end
$function$;

-- Monthly close message: one gentle opt-in notice in the last 3 days only,
-- with no catch-up blast on deploy, no new scheduler, and zero ledger writes.
CREATE TABLE IF NOT EXISTS v21_private.taphoa_monthly_close_notice_log(
 customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 month_start date NOT NULL,
 client_id text NOT NULL UNIQUE,
 message_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(customer_account_id,month_start)
);
REVOKE ALL ON v21_private.taphoa_monthly_close_notice_log FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_send_monthly_close_notices()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $monthly$
DECLARE
 v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_month date:=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_end date; v_next date; c record; v_sender uuid; addr jsonb;
 v_balance numeric; v_days integer; v_orders integer;
 v_client_id text; v_body text; v_msg uuid; v_count integer:=0;
BEGIN
 v_next:=(v_month+interval '1 month')::date;
 v_end:=v_next-1;
 -- No out-of-window catch-up: only the final three calendar days.
 IF v_today < v_end-2 OR v_today>v_end THEN RETURN 0; END IF;
 SELECT id INTO v_sender FROM public.v21_accounts
   WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL
   ORDER BY created_at,id LIMIT 1;
 IF v_sender IS NULL THEN RETURN 0; END IF;
 FOR c IN SELECT id,display_name FROM public.v21_accounts
   WHERE role='user' AND contact_group='customer'
     AND deleted_at IS NULL AND locked_at IS NULL
 LOOP
  BEGIN
   -- Do not disturb customers with a pending transfer/bill.
   IF v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   SELECT coalesce(sum(amount_vnd),0) INTO v_balance
   FROM public.taphoa_debt_ledger WHERE customer_account_id=c.id;
   -- Amount is stored in the same canonical units as existing policy
   -- balanceThousands; do not auto-message tiny residual balances.
   IF v_balance<10 THEN CONTINUE; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(
      'taphoa-month-close:'||c.id||':'||v_month,0));
   IF EXISTS(SELECT 1 FROM v21_private.taphoa_monthly_close_notice_log h
     WHERE h.customer_account_id=c.id AND h.month_start=v_month) THEN CONTINUE; END IF;
   -- Existing cycle reminders in the last 7 days suppress a monthly
   -- message. Do not send two reminders on adjacent days.
   IF EXISTS(
     SELECT 1 FROM public.v21_messages msg
     JOIN public.v21_conversations conv ON conv.id=msg.conversation_id
     WHERE (conv.member_a=c.id OR conv.member_b=c.id)
       AND msg.client_id LIKE 'taphoa:cycle-%'
       AND msg.deleted_at IS NULL
       AND msg.created_at >= now()-interval '7 days'
   ) THEN CONTINUE; END IF;
   IF v21_private.taphoa_cycle_payment_pending(c.id) THEN CONTINUE; END IF;
   SELECT count(distinct (coalesce(o.delivered_at,l.created_at)
             at time zone 'Asia/Ho_Chi_Minh')::date)::integer,
          count(distinct l.order_id)::integer
     INTO v_days,v_orders
   FROM public.taphoa_debt_ledger l
   JOIN public.taphoa_orders o ON o.id=l.order_id
      AND o.customer_account_id=l.customer_account_id
   WHERE l.customer_account_id=c.id AND l.entry_type='sale'
     AND (coalesce(o.delivered_at,l.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
       >=v_month
     AND (coalesce(o.delivered_at,l.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
       <v_next
     AND NOT EXISTS(SELECT 1 FROM public.taphoa_debt_ledger rev
       WHERE rev.customer_account_id=l.customer_account_id
         AND rev.order_id=l.order_id AND rev.entry_type='reversal');
   -- Re-check after the advisory lock; no stale amount at send time.
   SELECT coalesce(sum(amount_vnd),0) INTO v_balance FROM public.taphoa_debt_ledger
     WHERE customer_account_id=c.id;
   IF v_balance<10 THEN CONTINUE; END IF;
   addr:=v21_private.taphoa_cycle_address(c.display_name);
   v_body:=(addr->>'name')||' ơi, '||(addr->>'speaker')||
     ' xin phép đối chiếu công nợ cuối tháng '||to_char(v_month,'MM/YYYY')||' ạ.'
     ||chr(10)||'Tháng này mình mua '||coalesce(v_days,0)||' ngày ('||
     coalesce(v_orders,0)||' đơn hàng).'
     ||chr(10)||'Số dư hiện đang theo dõi: '||public.taphoa_chat_money(v_balance)||'.'
     ||chr(10)||'Nếu thuận tiện, mình cùng hoàn tất hoặc xác nhận lại trước '||
       to_char(v_end,'DD/MM/YYYY')||' để sang tháng '||to_char(v_next,'MM/YYYY')||
       ' theo dõi lượt mua mới rõ ràng hơn ạ.'
     ||chr(10)||'Khoản chưa thanh toán vẫn được chuyển sang tháng sau, '||
       'không bị xóa hoặc tính là đã thanh toán.'
     ||chr(10)||'Nếu mình đã gửi tiền, cứ gửi chứng từ để '||(addr->>'speaker')||
       ' đối chiếu, tránh nhắc nhầm. Cảm ơn mình ạ!';
   v_client_id:='taphoa:month-close:'||to_char(v_month,'YYYYMM')||':'||c.id||':debt';
   v_msg:=public.taphoa_chat_notify_customer(c.id,v_sender,v_client_id,v_body);
   IF v_msg IS NOT NULL THEN
     INSERT INTO v21_private.taphoa_monthly_close_notice_log
       (customer_account_id,month_start,client_id,message_id)
     VALUES(c.id,v_month,v_client_id,v_msg)
     ON CONFLICT DO NOTHING;
     v_count:=v_count+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'monthly_close_notice_skipped %',c.id;
  END;
 END LOOP;
 RETURN v_count;
END;
$monthly$;
REVOKE ALL ON FUNCTION v21_private.taphoa_send_monthly_close_notices()
 FROM PUBLIC,anon,authenticated;

-- Replace the previous before-due + due double-message schedule with ONE
-- near-month-close reminder. The existing pg_cron job keeps the same time.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_send_daily_reminders()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $daily$
DECLARE v_close integer;
BEGIN
 v_close:=v21_private.taphoa_send_monthly_close_notices();
 RETURN jsonb_build_object('pre_due_sent',0,'due_sent',0,'month_close_sent',v_close);
END; $daily$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_send_daily_reminders()
 FROM PUBLIC,anon,authenticated;
