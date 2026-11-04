-- SPEC-ORDER-CYCLE-PARTIAL-PAID-DUE-20261104
-- A cycle remains visible to explain the chronology, but a cycle whose
-- FIFO-estimated balance is zero is not counted as an actionable due order.
-- Read-only replacement of the same RPC; no money or reminder writes.
-- SPEC-ORDER-CYCLE-AMOUNT-PROGRESS-20261104
-- Source is the exact deployed read-only function; add gross per sale,
-- conservative remaining amount estimated by old-order-first (FIFO) and
-- day progress. All values are DISPLAY ONLY, not payment allocations.
-- User sees latest order first in UI; due days are still per order.
-- No change to ledger, sale, reminder, Zalo or scheduler.
-- Supersedes 20261104211500_taphoa_order_cycles_readonly_admin_user.sql.
-- SPEC-ORDER-CYCLES-READONLY-20261104
-- Each delivered, non-reversed sale in the CURRENT unpaid debt period has
-- its own D1..D7 clock, including multiple orders delivered the same day.
-- A new sale NEVER changes older due dates. The "three days without buying"
-- indicator follows the most recent delivery independently of order clocks.
-- Only a fully settled balance (<=0 in canonical positive-debt ledger units)
-- closes/reset the displayed set. Partial collections do not.
-- READ ONLY: no reminder/scheduler, no message, no ledger writes. Admin can
-- see customer summaries, signed-in User can see OWN summary only.
CREATE OR REPLACE FUNCTION public.taphoa_order_cycles_view()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $order_cycles$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_actor uuid;
  v_role text;
  v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_result jsonb;
BEGIN
  v_role:=coalesce(v_ctx->>'taphoa_role','');
  IF coalesce((v_ctx->>'allowed')::boolean,false) IS DISTINCT FROM true
    OR v_role NOT IN ('admin','user')
    OR coalesce(v_ctx->>'account_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'taphoa_access_denied' USING ERRCODE='42501'; END IF;
  v_actor:=(v_ctx->>'account_id')::uuid;

  WITH accounts AS (
    SELECT a.id
    FROM public.v21_accounts a
    WHERE a.role='user' AND a.contact_group='customer'
      AND a.deleted_at IS NULL AND a.locked_at IS NULL
      AND (v_role='admin' OR a.id=v_actor)
  ), ledger_running AS (
    SELECT l.customer_account_id,l.id,l.created_at,l.order_id,
      l.entry_type,l.amount_vnd,
      sum(l.amount_vnd) OVER (
        PARTITION BY l.customer_account_id
        ORDER BY l.created_at,l.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS balance_after
    FROM public.taphoa_debt_ledger l
    JOIN accounts a ON a.id=l.customer_account_id
  ), ledger_edges AS (
    SELECT r.*,
      CASE WHEN r.balance_after>0
        AND r.balance_after-r.amount_vnd<=0 THEN 1 ELSE 0 END AS opens_period
    FROM ledger_running r
  ), numbered AS (
    SELECT e.*,
      sum(e.opens_period) OVER (
        PARTITION BY e.customer_account_id
        ORDER BY e.created_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::integer AS debt_period_no
    FROM ledger_edges e
  ), latest AS (
    SELECT n.*,
      row_number() OVER (
        PARTITION BY n.customer_account_id
        ORDER BY n.created_at DESC,n.id DESC
      ) AS latest_rank
    FROM numbered n
  ), active AS (
    SELECT customer_account_id,debt_period_no,balance_after
    FROM latest WHERE latest_rank=1 AND balance_after>0
  ), order_events AS (
    -- DISTINCT ON keeps one D7 milestone per order ID even if a historical
    -- ledger contains more than one sale row for the same delivered order.
    SELECT DISTINCT ON (n.customer_account_id,n.order_id)
      n.customer_account_id,n.order_id,n.id AS ledger_id,
      greatest(n.amount_vnd,0)::numeric AS amount_thousands,
      coalesce(o.delivered_at,n.created_at) AS purchase_at,
      (coalesce(o.delivered_at,n.created_at)
        AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS purchase_day
    FROM numbered n
    JOIN active act
      ON act.customer_account_id=n.customer_account_id
      AND act.debt_period_no=n.debt_period_no
    JOIN public.taphoa_orders o
      ON o.id=n.order_id AND o.customer_account_id=n.customer_account_id
    WHERE n.entry_type='sale' AND n.order_id IS NOT NULL
      AND NOT EXISTS(
        SELECT 1 FROM public.taphoa_debt_ledger rev
        WHERE rev.customer_account_id=n.customer_account_id
          AND rev.order_id=n.order_id AND rev.entry_type='reversal'
      )
    ORDER BY n.customer_account_id,n.order_id,n.created_at,n.id
  ), order_numbered AS (
    SELECT oe.*,
      row_number() OVER (
        PARTITION BY oe.customer_account_id
        ORDER BY oe.purchase_day,oe.purchase_at,oe.ledger_id,oe.order_id
      )::integer AS order_cycle_no,
      (oe.purchase_day+6) AS seven_due_day
    FROM order_events oe
  ), order_finance AS (
    SELECT n.*,
      -- Display-only FIFO estimate: collections reduce the oldest order
      -- first. Newer orders keep their remaining values until older ones
      -- are covered. Never write an allocation or exceed current debt.
      greatest(0::numeric,least(n.amount_thousands,
        act.balance_after - coalesce(
          sum(n.amount_thousands) OVER (
            PARTITION BY n.customer_account_id
            ORDER BY n.order_cycle_no DESC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),0::numeric)
      )) AS estimated_remaining_thousands
    FROM order_numbered n
    JOIN active act ON act.customer_account_id=n.customer_account_id
  ), grouped AS (
    SELECT customer_account_id,
      jsonb_agg(jsonb_build_object(
        'number',order_cycle_no,
        'orderId',order_id,
        'amountThousands',amount_thousands,
        'estimatedRemainingThousands',estimated_remaining_thousands,
        'progressDays',least(7,greatest(1,v_today-purchase_day+1)),
        'elapsedDays',greatest(1,v_today-purchase_day+1),
        'purchaseDay',to_char(purchase_day,'YYYY-MM-DD'),
        'dueDay',to_char(seven_due_day,'YYYY-MM-DD'),
        'isDue',v_today>=seven_due_day AND estimated_remaining_thousands>0,
        'daysOverdue',case when estimated_remaining_thousands>0
          then greatest(0,v_today-seven_due_day) else 0 end
      ) ORDER BY order_cycle_no) AS order_cycles,
      count(*)::integer AS order_count,
      min(seven_due_day) FILTER(WHERE estimated_remaining_thousands>0) AS earliest_due,
      max(purchase_day) AS last_purchase_day,
      count(*) FILTER(WHERE seven_due_day<=v_today
        AND estimated_remaining_thousands>0)::integer AS due_count
    FROM order_finance GROUP BY customer_account_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'customerId',a.id,
      'activePeriodNo',coalesce(act.debt_period_no,0),
      'balanceThousands',coalesce(act.balance_after,0),
      'isOpen',act.customer_account_id IS NOT NULL,
      'orderCount',coalesce(g.order_count,0),
      'orderCycles',coalesce(g.order_cycles,'[]'::jsonb),
      'todayDay',to_char(v_today,'YYYY-MM-DD'),
      'earliestDueDay',case when act.customer_account_id IS NOT NULL
        THEN to_char(g.earliest_due,'YYYY-MM-DD') ELSE null END,
      'dueCount',coalesce(g.due_count,0),
      'lastPurchaseDay',case when act.customer_account_id IS NOT NULL
        THEN to_char(g.last_purchase_day,'YYYY-MM-DD') ELSE null END,
      'idleDays',case when g.last_purchase_day IS NOT NULL
        THEN greatest(0,v_today-g.last_purchase_day) ELSE 0 END,
      'idleReviewDay',case when g.last_purchase_day IS NOT NULL
        THEN to_char(g.last_purchase_day+3,'YYYY-MM-DD') ELSE null END,
      'idleNeedsReview',g.last_purchase_day IS NOT NULL
        AND v_today>=g.last_purchase_day+3
    ) ORDER BY a.id),'[]'::jsonb)
  INTO v_result
  FROM accounts a
  LEFT JOIN active act ON act.customer_account_id=a.id
  LEFT JOIN grouped g ON g.customer_account_id=a.id;

  RETURN v_result;
END;
$order_cycles$;
REVOKE ALL ON FUNCTION public.taphoa_order_cycles_view() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_order_cycles_view() TO authenticated;
