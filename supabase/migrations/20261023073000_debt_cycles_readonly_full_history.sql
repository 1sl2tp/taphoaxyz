-- DEBT-CYCLE-20261023: readonly, audit-preserving debt-cycle history.
-- One cycle begins whenever an account balance moves from <= 0 to > 0.
-- It ends ONLY when the balance becomes <= 0; 3/7-day rules are alerts, not resets.
-- Every transaction is examined, not merely the latest 50-page UI ledger.
create or replace function public.taphoa_debt_cycles()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
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
      l.amount_vnd,
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
      max(n.created_at) filter(where n.is_purchase) as last_purchase_at
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
        'threeDayStop',e.closed_at is null and e.days_without_purchase>=3
      ) order by e.cycle_no) as history
    from entries e
    group by e.customer_account_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId',a.id,
    'cycles',coalesce(g.history,'[]'::jsonb)
  ) order by a.display_name,a.id),'[]'::jsonb)
  into result
  from public.v21_accounts a
  left join aggregated g on g.customer_account_id=a.id
  where a.role='user' and a.contact_group='customer' and a.deleted_at is null
    and a.locked_at is null;

  return result;
end
$function$;

revoke all on function public.taphoa_debt_cycles() from public,anon;
grant execute on function public.taphoa_debt_cycles() to authenticated;
