-- Deployed on shared Supabase as taphoa_admin_customer_care_report_20261010.
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
     ) order by delivered_count desc,name),'[]'::jsonb)
  ) into v_output from rows;
 return v_output;
end;
$function$

revoke all on function public.taphoa_admin_customer_care_report(integer) from public,anon;
grant execute on function public.taphoa_admin_customer_care_report(integer) to authenticated,service_role;
