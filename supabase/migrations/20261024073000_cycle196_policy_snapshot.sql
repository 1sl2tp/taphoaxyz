-- CYCLE-196: Immutable earliest due date within one unpaid customer-debt cycle.
-- A new sale while debt is still positive NEVER opens or extends another cycle.
-- Vietnam calendar dates are used for policy, ledger remains authoritative.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_policy_snapshot(p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE
  v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_cycle integer; v_start date; v_last date;
  v_first_gap date; v_stop_due date; v_seven_due date;
  v_due date; v_balance numeric; v_count integer;
  v_first_order uuid; v_reason text;
BEGIN
  IF p_customer IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(sum(l.amount_vnd),0) INTO v_balance
  FROM public.taphoa_debt_ledger l WHERE l.customer_account_id=p_customer;
  IF v_balance<=0 THEN RETURN NULL; END IF;
  WITH running AS (
    SELECT l.id,l.created_at,l.order_id,l.entry_type,l.amount_vnd,
      coalesce(o.delivered_at,l.created_at) delivered_at,
      sum(l.amount_vnd) OVER (ORDER BY l.created_at,l.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) balance_after,
      (l.entry_type='sale' AND NOT EXISTS (
        SELECT 1 FROM public.taphoa_debt_ledger r
        WHERE r.order_id=l.order_id AND r.customer_account_id=p_customer
          AND r.entry_type='reversal' AND r.order_id IS NOT NULL)) is_purchase
    FROM public.taphoa_debt_ledger l
    LEFT JOIN public.taphoa_orders o
      ON o.id=l.order_id AND o.customer_account_id=p_customer
    WHERE l.customer_account_id=p_customer
  ), transitions AS (
    SELECT r.*,
      (r.balance_after>0 AND r.balance_after-r.amount_vnd<=0) started,
      (r.balance_after<=0 AND r.balance_after-r.amount_vnd>0) closed
    FROM running r
  ), numbered AS (
    SELECT t.*,sum(CASE WHEN t.started THEN 1 ELSE 0 END) OVER
      (ORDER BY t.created_at,t.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::integer cycle_no
    FROM transitions t
  ), cycles AS (
    SELECT cycle_no,
      min(created_at) FILTER(WHERE started) start_at,
      min(created_at) FILTER(WHERE closed) close_at,
      (max(order_id::text) FILTER(WHERE started))::uuid first_order_id
    FROM numbered WHERE cycle_no>0 GROUP BY cycle_no
  ), current_cycle AS (
    SELECT * FROM cycles WHERE close_at IS NULL ORDER BY cycle_no DESC LIMIT 1
  ), buys AS (
    SELECT n.cycle_no, (n.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date buy_day
    FROM numbered n JOIN current_cycle c ON c.cycle_no=n.cycle_no
    WHERE n.is_purchase
  ), distinct_days AS (
    SELECT DISTINCT buy_day FROM buys
  ), gaps AS (
    SELECT d.buy_day,lag(d.buy_day) OVER (ORDER BY d.buy_day) prior_day FROM distinct_days d
  )
  SELECT c.cycle_no,
    (c.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    coalesce((SELECT max(b.buy_day) FROM buys b),
      (c.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    (SELECT min(g.prior_day+3) FROM gaps g
      WHERE g.prior_day IS NOT NULL AND g.buy_day-g.prior_day>=3),
    (SELECT count(*)::integer FROM buys),
    c.first_order_id
  INTO v_cycle,v_start,v_last,v_first_gap,v_count,v_first_order
  FROM current_cycle c;
  IF v_start IS NULL THEN RETURN NULL; END IF;
  v_seven_due:=v_start+6;
  -- Once a three-day gap occurred, later purchases cannot undo it.
  v_stop_due:=least(coalesce(v_first_gap,v_last+3),v_last+3);
  v_due:=least(v_seven_due,v_stop_due);
  v_reason:=CASE WHEN v_stop_due<=v_seven_due THEN 'stopped_buying' ELSE 'seven_days' END;
  RETURN jsonb_build_object(
    'cycleNo',v_cycle,'startDay',to_char(v_start,'YYYY-MM-DD'),
    'lastPurchaseDay',to_char(v_last,'YYYY-MM-DD'),
    'purchaseCount',v_count,'firstOrderId',v_first_order,
    'durationDays',greatest(1,v_today-v_start+1),
    'idleDays',greatest(0,v_today-v_last),
    'firstGapDay',CASE WHEN v_first_gap IS NULL THEN NULL ELSE to_char(v_first_gap,'YYYY-MM-DD') END,
    'stopDueDay',to_char(v_stop_due,'YYYY-MM-DD'),
    'sevenDueDay',to_char(v_seven_due,'YYYY-MM-DD'),
    'dueDay',to_char(v_due,'YYYY-MM-DD'),
    'dueReason',v_reason,
    'isDue',v_today>=v_due,
    'daysOverdue',greatest(0,v_today-v_due),
    'balanceThousands',v_balance);
END;
$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_policy_snapshot(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_order_cycle_policy_note(p_customer uuid,p_order uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE v jsonb; v_seven text; v_due text; v_first boolean;
BEGIN
  v:=v21_private.taphoa_cycle_policy_snapshot(p_customer);
  IF v IS NULL THEN RETURN ''; END IF;
  v_first:=coalesce(v->>'firstOrderId','')=coalesce(p_order::text,'');
  v_seven:=to_char((v->>'sevenDueDay')::date,'DD/MM/YYYY');
  v_due:=to_char((v->>'dueDay')::date,'DD/MM/YYYY');
  IF v_first THEN
    RETURN E'\n📅 BẮT ĐẦU CHU KỲ NỢ '||(v->>'cycleNo')
      ||E' · Ngày 1.\nMình có thể nhập tiếp trong thời gian hỗ trợ, nhưng nếu ngừng mua đến mốc 3 ngày phải thanh toán ngay (ngày thứ 4). Nếu vẫn mua đều, chậm nhất '||v_seven||E' phải tất toán toàn bộ chu kỳ. Đơn mua tiếp không gia hạn mốc 7 ngày.';
  END IF;
  IF (v->>'isDue')::boolean THEN
    RETURN E'\n⚠️ Chu kỳ nợ '||(v->>'cycleNo')||' đã đến hạn '||v_due
      ||CASE WHEN (v->>'daysOverdue')::int>0
        THEN ' · Quá hạn '||(v->>'daysOverdue')||' ngày' ELSE '' END
      ||E'. Mua thêm không xóa hạn thanh toán cũ; vui lòng tất toán toàn bộ.';
  END IF;
  RETURN E'\n📅 Tiếp tục chu kỳ nợ '||(v->>'cycleNo')
     ||' · Ngày '||(v->>'durationDays')
     ||' · '||(v->>'purchaseCount')||' lượt mua.'
     ||E'\nNếu ngừng mua đến mốc 3 ngày cần thanh toán; nếu mua tiếp, tất toán toàn bộ chậm nhất '||v_seven||'.';
END;
$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_order_cycle_policy_note(uuid,uuid) FROM PUBLIC,anon,authenticated;
