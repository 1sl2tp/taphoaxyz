-- Admin-only report migration deployed as two staged patches on 2026-10-10.
-- One-argument compatibility signature repairs name column; three-argument signature adds explicit period, cost snapshots, manual debt separation.
CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_care_report(p_inactive_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
 v_context jsonb;
 v_days integer := greatest(7,least(coalesce(p_inactive_days,7),30));
 v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_output jsonb;
begin
 v_context := public.taphoa_access_context();
 if coalesce((v_context->>'allowed')::boolean,false) is not true
    or coalesce(v_context->>'taphoa_role','') <> 'admin' then
   raise exception 'taphoa_access_denied' using errcode='42501';
 end if;

 with customers as (
   select id,username,display_name,created_at
   from public.v21_accounts
   where role='user' and contact_group='customer' and deleted_at is null
 ),
 delivered as (
   select o.customer_account_id,o.id,o.delivered_at,o.created_at,
     (coalesce(o.delivered_at,o.created_at) at time zone 'Asia/Ho_Chi_Minh')::date as buy_day
   from public.taphoa_orders o
   join customers c on c.id=o.customer_account_id
   where o.status='delivered'
 ),
 buying_days as (
   select customer_account_id,buy_day,
     lag(buy_day) over(partition by customer_account_id order by buy_day) as previous_day
   from (select distinct customer_account_id,buy_day from delivered) x
 ),
 buying_stats as (
   select customer_account_id,count(*)::integer as purchase_days,
     round(avg((buy_day-previous_day)::numeric),1) as avg_purchase_gap_days,
     max(buy_day) as last_purchase_day
   from buying_days group by customer_account_id
 ),
 sale_amounts as (
   select d.customer_account_id,coalesce(sum(l.amount_vnd),0) as revenue
   from delivered d left join public.taphoa_debt_ledger l
     on l.order_id=d.id and l.entry_type='sale'
   group by d.customer_account_id
 ),
 delivery_counts as (
   select customer_account_id,count(*)::integer as delivered_count
   from delivered group by customer_account_id
 ),
 draft_amounts as (
   select o.id,o.customer_account_id,o.created_at,o.display_prefix,o.display_no,
     coalesce(sum(i.qty*i.unit_price_vnd),0) as amount
   from public.taphoa_orders o
   join customers c on c.id=o.customer_account_id
   left join public.taphoa_order_items i on i.order_id=o.id
   where o.status='pending'
   group by o.id,o.customer_account_id,o.created_at,o.display_prefix,o.display_no
 ),
 pending_stats as (
   select customer_account_id,count(*)::integer as pending_count,
     sum(amount) as pending_amount,
     max(created_at) as last_pending_at,
     string_agg(coalesce(display_prefix,'DT')||display_no::text,', ' order by created_at desc) as pending_codes
   from draft_amounts group by customer_account_id
 ),
 ledger_stats as (
   select customer_account_id,
     coalesce(sum(amount_vnd),0) as debt_balance,
     coalesce(sum(amount_vnd) filter(where amount_vnd>0),0) as total_charged,
     coalesce(-sum(amount_vnd) filter(where entry_type='collection'),0) as collected,
     count(*) filter(where entry_type='collection')::integer as collection_count,
     max(created_at) filter(where entry_type='collection') as last_collection_at
   from public.taphoa_debt_ledger
   where customer_account_id in (select id from customers)
   group by customer_account_id
 ),
 collection_days as (
   select customer_account_id,paid_day,
     lag(paid_day) over(partition by customer_account_id order by paid_day) previous_day
   from (
      select distinct customer_account_id,
         (created_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_day
      from public.taphoa_debt_ledger
      where entry_type='collection' and customer_account_id in (select id from customers)
   ) x
 ),
 payment_stats as (
   select customer_account_id,count(*)::integer as collection_days,
     round(avg((paid_day-previous_day)::numeric),1) as avg_collection_gap_days
   from collection_days group by customer_account_id
 ),
 positive_entries as (
   select customer_account_id,created_at,amount_vnd,
     sum(amount_vnd) over(partition by customer_account_id order by created_at,id
       rows unbounded preceding) as cumulative_charged
   from public.taphoa_debt_ledger
   where amount_vnd>0 and customer_account_id in (select id from customers)
 ),
 oldest_unpaid as (
   select p.customer_account_id,
     min(p.created_at) filter(where p.cumulative_charged>coalesce(l.total_charged-l.debt_balance,0)) as oldest_unpaid_at
   from positive_entries p join ledger_stats l on l.customer_account_id=p.customer_account_id
   where l.debt_balance>0
   group by p.customer_account_id
 ),
 rows as (
   select c.id,c.username,c.display_name,
     coalesce(dc.delivered_count,0) as delivered_count,
     coalesce(bs.purchase_days,0) as purchase_days,
     bs.avg_purchase_gap_days,
     bs.last_purchase_day,
     case when bs.last_purchase_day is null then null
       else v_today-bs.last_purchase_day end as days_since_purchase,
     coalesce(sa.revenue,0) as total_revenue,
     case when coalesce(dc.delivered_count,0)>0 then
       round(coalesce(sa.revenue,0)/dc.delivered_count,0) else null end as avg_order_value,
     coalesce(ps.pending_count,0) as pending_count,
     coalesce(ps.pending_amount,0) as pending_amount,
     ps.last_pending_at,ps.pending_codes,
     coalesce(ls.debt_balance,0) as debt_balance,
     coalesce(ls.total_charged,0) as total_charged,
     coalesce(ls.collected,0) as collected,
     coalesce(ls.collection_count,0) as collection_count,
     coalesce(pays.collection_days,0) as collection_days,
     pays.avg_collection_gap_days,
     ls.last_collection_at,
     case when coalesce(ls.debt_balance,0)>0 and ou.oldest_unpaid_at is not null
       then v_today - (ou.oldest_unpaid_at at time zone 'Asia/Ho_Chi_Minh')::date
       else null end as oldest_unpaid_days,
     case
       when lower(c.username)='test' then 'demo'
       when coalesce(ps.pending_count,0)>0 then 'pending'
       when coalesce(dc.delivered_count,0)=0 then 'never'
       when v_today-bs.last_purchase_day>=v_days then 'lapsed'
       when coalesce(dc.delivered_count,0)>=4 and coalesce(bs.purchase_days,0)>=3 then 'repeat'
       else 'bought'
     end as segment
   from customers c
   left join delivery_counts dc on dc.customer_account_id=c.id
   left join buying_stats bs on bs.customer_account_id=c.id
   left join sale_amounts sa on sa.customer_account_id=c.id
   left join pending_stats ps on ps.customer_account_id=c.id
   left join ledger_stats ls on ls.customer_account_id=c.id
   left join payment_stats pays on pays.customer_account_id=c.id
   left join oldest_unpaid ou on ou.customer_account_id=c.id
 )
 select jsonb_build_object(
    'generated_on',v_today,'inactive_days',v_days,
    'total_customers',count(*),
    'bought_customers',count(*) filter(where delivered_count>0),
    'never_delivered_customers',count(*) filter(where delivered_count=0),
    'pending_customers',count(*) filter(where pending_count>0),
    'lapsed_customers',count(*) filter(where days_since_purchase>=v_days and delivered_count>0),
    'owing_customers',count(*) filter(where debt_balance>0),
    'customers',coalesce(jsonb_agg(jsonb_build_object(
       'id',id,'username',username,'name',display_name,
       'segment',segment,'delivered_count',delivered_count,'purchase_days',purchase_days,
       'avg_purchase_gap_days',avg_purchase_gap_days,'last_purchase_day',last_purchase_day,
       'days_since_purchase',days_since_purchase,'total_revenue',total_revenue,
       'avg_order_value',avg_order_value,'pending_count',pending_count,
       'pending_amount',pending_amount,'pending_codes',pending_codes,
       'last_pending_at',last_pending_at,'debt_balance',debt_balance,
       'total_charged',total_charged,'collected',collected,
       'collection_count',collection_count,'collection_days',collection_days,
       'avg_collection_gap_days',avg_collection_gap_days,
       'last_collection_at',last_collection_at,'oldest_unpaid_days',oldest_unpaid_days
     ) order by delivered_count desc,display_name),'[]'::jsonb)
  ) into v_output from rows;
 return v_output;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_care_report(p_inactive_days integer, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
 v_context jsonb;
 v_days integer := greatest(7,least(coalesce(p_inactive_days,7),30));
 v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
 v_output jsonb;
begin
 v_context := public.taphoa_access_context();
 if coalesce((v_context->>'allowed')::boolean,false) is not true
    or coalesce(v_context->>'taphoa_role','') <> 'admin' then
   raise exception 'taphoa_access_denied' using errcode='42501';
 end if;
 if (p_start_date is null) <> (p_end_date is null) or (p_start_date is not null and p_end_date < p_start_date) then
   raise exception 'invalid_report_dates' using errcode='22023';
 end if;
 with customers as (
   select id,username,display_name,created_at
   from public.v21_accounts
   where role='user' and contact_group='customer' and deleted_at is null
 ),
 delivered as (
   select o.customer_account_id,o.id,o.delivered_at,o.created_at,
     (coalesce(o.delivered_at,o.created_at) at time zone 'Asia/Ho_Chi_Minh')::date as buy_day
   from public.taphoa_orders o
   join customers c on c.id=o.customer_account_id
   where o.status='delivered'
 ),
 buying_days as (
   select customer_account_id,buy_day,
     lag(buy_day) over(partition by customer_account_id order by buy_day) as previous_day
   from (select distinct customer_account_id,buy_day from delivered) x
 ),
 buying_stats as (
   select customer_account_id,count(*)::integer as purchase_days,
     round(avg((buy_day-previous_day)::numeric),1) as avg_purchase_gap_days,
     max(buy_day) as last_purchase_day
   from buying_days group by customer_account_id
 ),
 sale_amounts as (
   select d.customer_account_id,sum(i.qty*i.unit_price_vnd) as revenue
   from delivered d join public.taphoa_order_items i on i.order_id=d.id
   group by d.customer_account_id
 ),
 delivery_counts as (
   select customer_account_id,count(*)::integer as delivered_count
   from delivered group by customer_account_id
 ),

 period_delivered as (
   select d.* from delivered d where
     (p_start_date is null or d.buy_day>=p_start_date) and
     (p_end_date is null or d.buy_day<=p_end_date)
 ),
 period_order_counts as (
   select customer_account_id,count(*)::integer as orders,count(distinct buy_day)::integer as purchase_days
   from period_delivered group by 1
 ),
 period_finance as (
   select d.customer_account_id,sum(i.qty*i.unit_price_vnd) as revenue,
     sum(i.qty*i.unit_cost_vnd_snapshot) as cost,
     count(*) filter(where i.unit_cost_vnd_snapshot is null)::integer as missing
   from period_delivered d join public.taphoa_order_items i on i.order_id=d.id
   group by d.customer_account_id
 ),
 system_finance as (
   select coalesce(sum(i.qty*i.unit_price_vnd),0) as revenue,
     coalesce(sum(i.qty*i.unit_cost_vnd_snapshot),0) as cost,
     count(*) filter(where i.unit_cost_vnd_snapshot is null)::integer as missing,
     count(distinct o.id)::integer as orders
   from public.taphoa_orders o join public.taphoa_order_items i on i.order_id=o.id
   where o.status='delivered'
     and (p_start_date is null or (o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date>=p_start_date)
     and (p_end_date is null or (o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date<=p_end_date)
 ),
 period_ledger as (
   select l.customer_account_id,
     coalesce(sum(l.amount_vnd) filter(where l.entry_type='sale'),0) as sales_posted,
     coalesce(sum(l.amount_vnd) filter(where l.entry_type='payment'),0) as manual_debt,
     coalesce(-sum(l.amount_vnd) filter(where l.entry_type='collection'),0) as paid,
     coalesce(-sum(l.amount_vnd) filter(where l.entry_type='reversal'),0) as adjusted
   from public.taphoa_debt_ledger l join customers c on c.id=l.customer_account_id
   where (p_start_date is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date>=p_start_date)
     and (p_end_date is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date<=p_end_date)
   group by l.customer_account_id
 ),
 draft_amounts as (
   select o.id,o.customer_account_id,o.created_at,o.display_prefix,o.display_no,
     coalesce(sum(i.qty*i.unit_price_vnd),0) as amount
   from public.taphoa_orders o
   join customers c on c.id=o.customer_account_id
   left join public.taphoa_order_items i on i.order_id=o.id
   where o.status='pending'
   group by o.id,o.customer_account_id,o.created_at,o.display_prefix,o.display_no
 ),
 pending_stats as (
   select customer_account_id,count(*)::integer as pending_count,
     sum(amount) as pending_amount,
     max(created_at) as last_pending_at,
     string_agg(coalesce(display_prefix,'DT')||display_no::text,', ' order by created_at desc) as pending_codes
   from draft_amounts group by customer_account_id
 ),
 ledger_stats as (
   select customer_account_id,
     coalesce(sum(amount_vnd),0) as debt_balance,
     coalesce(sum(amount_vnd) filter(where entry_type='sale'),0) as lifetime_sales,
     coalesce(sum(amount_vnd) filter(where entry_type='payment'),0) as lifetime_manual_debt,
     coalesce(-sum(amount_vnd) filter(where entry_type='reversal'),0) as lifetime_reversals,
     coalesce(sum(amount_vnd) filter(where amount_vnd>0),0) as total_charged,
     coalesce(-sum(amount_vnd) filter(where entry_type='collection'),0) as collected,
     count(*) filter(where entry_type='collection')::integer as collection_count,
     max(created_at) filter(where entry_type='collection') as last_collection_at
   from public.taphoa_debt_ledger
   where customer_account_id in (select id from customers)
   group by customer_account_id
 ),
 collection_days as (
   select customer_account_id,paid_day,
     lag(paid_day) over(partition by customer_account_id order by paid_day) previous_day
   from (
      select distinct customer_account_id,
         (created_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_day
      from public.taphoa_debt_ledger
      where entry_type='collection' and customer_account_id in (select id from customers)
   ) x
 ),
 payment_stats as (
   select customer_account_id,count(*)::integer as collection_days,
     round(avg((paid_day-previous_day)::numeric),1) as avg_collection_gap_days
   from collection_days group by customer_account_id
 ),
 positive_entries as (
   select customer_account_id,created_at,amount_vnd,
     sum(amount_vnd) over(partition by customer_account_id order by created_at,id
       rows unbounded preceding) as cumulative_charged
   from public.taphoa_debt_ledger
   where amount_vnd>0 and customer_account_id in (select id from customers)
 ),
 oldest_unpaid as (
   select p.customer_account_id,
     min(p.created_at) filter(where p.cumulative_charged>coalesce(l.total_charged-l.debt_balance,0)) as oldest_unpaid_at
   from positive_entries p join ledger_stats l on l.customer_account_id=p.customer_account_id
   where l.debt_balance>0
   group by p.customer_account_id
 ),
 rows as (
   select c.id,c.username,c.display_name,
     coalesce(dc.delivered_count,0) as delivered_count,
     coalesce(bs.purchase_days,0) as purchase_days,
     bs.avg_purchase_gap_days,
     bs.last_purchase_day,
     case when bs.last_purchase_day is null then null
       else v_today-bs.last_purchase_day end as days_since_purchase,
     coalesce(sa.revenue,0) as lifetime_revenue,
     coalesce(poc.orders,0) as period_delivered_count,
     coalesce(poc.purchase_days,0) as period_purchase_days,
     coalesce(pf.revenue,0) as total_revenue,
     coalesce(pf.cost,0) as total_cost,
     coalesce(pf.missing,0) as missing_cost_lines,
     case when coalesce(pf.missing,0)=0 then coalesce(pf.revenue,0)-coalesce(pf.cost,0) else null end as gross_profit,
     case when coalesce(pf.missing,0)=0 and coalesce(pf.revenue,0)>0 then round(100*(pf.revenue-pf.cost)/pf.revenue,2) else null end as gross_margin_percent,
     case when coalesce(pf.missing,0)=0 and coalesce(pf.revenue,0)>0 then round(100*pf.cost/pf.revenue,2) else null end as cost_ratio_percent,
     case when sf.revenue>0 then round(100*coalesce(pf.revenue,0)/sf.revenue,2) else null end as revenue_share_percent,
     case when coalesce(pf.missing,0)=0 and sf.missing=0 and sf.revenue-sf.cost>0
       then round(100*(coalesce(pf.revenue,0)-coalesce(pf.cost,0))/(sf.revenue-sf.cost),2) else null end as profit_share_percent,
     case when coalesce(poc.orders,0)>0 then round(coalesce(pf.revenue,0)/poc.orders,0) else null end as avg_order_value,
     coalesce(pl.sales_posted,0) as period_sales_posted,
     coalesce(pl.manual_debt,0) as period_manual_debt,
     coalesce(pl.paid,0) as period_collected,
     coalesce(pl.adjusted,0) as period_adjusted,
     coalesce(ps.pending_count,0) as pending_count,
     coalesce(ps.pending_amount,0) as pending_amount,
     ps.last_pending_at,ps.pending_codes,
     coalesce(ls.debt_balance,0) as debt_balance,
     coalesce(ls.total_charged,0) as total_charged,
     coalesce(ls.lifetime_sales,0) as lifetime_sales,
     coalesce(ls.lifetime_manual_debt,0) as lifetime_manual_debt,
     coalesce(ls.lifetime_reversals,0) as lifetime_reversals,
     coalesce(ls.collected,0) as collected,
     coalesce(ls.collection_count,0) as collection_count,
     coalesce(pays.collection_days,0) as collection_days,
     pays.avg_collection_gap_days,
     ls.last_collection_at,
     case when coalesce(ls.debt_balance,0)>0 and ou.oldest_unpaid_at is not null
       then v_today - (ou.oldest_unpaid_at at time zone 'Asia/Ho_Chi_Minh')::date
       else null end as oldest_unpaid_days,
     case
       when lower(c.username)='test' then 'demo'
       when coalesce(ps.pending_count,0)>0 then 'pending'
       when coalesce(dc.delivered_count,0)=0 then 'never'
       when v_today-bs.last_purchase_day>=v_days then 'lapsed'
       when coalesce(dc.delivered_count,0)>=4 and coalesce(bs.purchase_days,0)>=3 then 'repeat'
       else 'bought'
     end as segment
   from customers c
   cross join system_finance sf
   left join period_order_counts poc on poc.customer_account_id=c.id
   left join period_finance pf on pf.customer_account_id=c.id
   left join period_ledger pl on pl.customer_account_id=c.id
   left join delivery_counts dc on dc.customer_account_id=c.id
   left join buying_stats bs on bs.customer_account_id=c.id
   left join sale_amounts sa on sa.customer_account_id=c.id
   left join pending_stats ps on ps.customer_account_id=c.id
   left join ledger_stats ls on ls.customer_account_id=c.id
   left join payment_stats pays on pays.customer_account_id=c.id
   left join oldest_unpaid ou on ou.customer_account_id=c.id
 )
 select jsonb_build_object(
    'generated_on',v_today,'inactive_days',v_days,
    'period_start',p_start_date,'period_end',p_end_date,
    'system', (select jsonb_build_object(
      'revenue',sf.revenue,'cost',sf.cost,
      'gross_profit',case when sf.missing=0 then sf.revenue-sf.cost else null end,
      'gross_margin_percent',case when sf.missing=0 and sf.revenue>0 then round(100*(sf.revenue-sf.cost)/sf.revenue,2) else null end,
      'cost_ratio_percent',case when sf.missing=0 and sf.revenue>0 then round(100*sf.cost/sf.revenue,2) else null end,
      'missing_cost_lines',sf.missing,'delivered_orders',sf.orders
    ) from system_finance sf),
    'total_customers',count(*),
    'bought_customers',count(*) filter(where delivered_count>0),
    'never_delivered_customers',count(*) filter(where delivered_count=0),
    'pending_customers',count(*) filter(where pending_count>0),
    'lapsed_customers',count(*) filter(where days_since_purchase>=v_days and delivered_count>0),
    'owing_customers',count(*) filter(where debt_balance>0),
    'customers',coalesce(jsonb_agg(jsonb_build_object(
       'id',id,'username',username,'name',display_name,
       'segment',segment,'delivered_count',delivered_count,'purchase_days',purchase_days,
       'avg_purchase_gap_days',avg_purchase_gap_days,'last_purchase_day',last_purchase_day,
       'days_since_purchase',days_since_purchase,
       'lifetime_revenue',lifetime_revenue,'period_delivered_count',period_delivered_count,
       'period_purchase_days',period_purchase_days,'total_revenue',total_revenue,
       'total_cost',total_cost,'gross_profit',gross_profit,
       'gross_margin_percent',gross_margin_percent,
       'cost_ratio_percent',cost_ratio_percent,
       'missing_cost_lines',missing_cost_lines,'revenue_share_percent',revenue_share_percent,
       'profit_share_percent',profit_share_percent,
       'period_sales_posted',period_sales_posted,'period_manual_debt',period_manual_debt,
       'period_collected',period_collected,'period_adjusted',period_adjusted,
       'avg_order_value',avg_order_value,'pending_count',pending_count,
       'pending_amount',pending_amount,'pending_codes',pending_codes,
       'last_pending_at',last_pending_at,'debt_balance',debt_balance,
       'total_charged',total_charged,'lifetime_sales',lifetime_sales,
       'lifetime_manual_debt',lifetime_manual_debt,'lifetime_reversals',lifetime_reversals,
       'collected',collected,
       'collection_count',collection_count,'collection_days',collection_days,
       'avg_collection_gap_days',avg_collection_gap_days,
       'last_collection_at',last_collection_at,'oldest_unpaid_days',oldest_unpaid_days
     ) order by delivered_count desc,display_name),'[]'::jsonb)
  ) into v_output from rows;
 return v_output;
end;
$function$
;
revoke all on function public.taphoa_admin_customer_care_report(integer,date,date) from public,anon;
grant execute on function public.taphoa_admin_customer_care_report(integer,date,date) to authenticated,service_role;
