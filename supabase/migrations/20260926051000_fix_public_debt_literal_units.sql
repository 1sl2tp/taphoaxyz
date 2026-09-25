-- Public customer debt must use the same literal money unit as admin.
-- The canonical taphoa_debt_ledger.amount_vnd values were converted to literal
-- business values in 20260922194500_literal_business_money_units.sql.
-- Do not scale them by 1000 in public RPCs.

create or replace function public.taphoa_public_debt_ledger_for_customer(
  p_customer_id uuid,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  customer_row public.v21_accounts;
  limit_rows integer:=greatest(1,least(100,coalesce(p_limit,50)));
  current_balance numeric;
  transactions jsonb;
begin
  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found'; end if;

  select coalesce(sum(amount_vnd),0) into current_balance
  from public.taphoa_debt_ledger
  where customer_account_id=p_customer_id;

  with running as (
    select l.*,
      sum(l.amount_vnd) over(order by l.created_at,l.id rows between unbounded preceding and current row) as balance_after
    from public.taphoa_debt_ledger l
    where l.customer_account_id=p_customer_id
  ), page as (
    select * from running
    where p_before_at is null
       or (created_at,id)<(p_before_at,coalesce(p_before_id,9223372036854775807::bigint))
    order by created_at desc,id desc
    limit limit_rows
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,
      'maDon',case when order_id is null then '' else order_id::text end,
      'order_id',case when order_id is null then '' else order_id::text end,
      'entryType',entry_type,
      'soTien',abs(amount_vnd),
      'amount',abs(amount_vnd),
      'bienDong',amount_vnd,
      'movement',amount_vnd,
      'balanceAfter',balance_after,
      'balance_after',balance_after,
      'ghiChu',note,
      'note',note,
      'ngay',created_at,
      'occurred_at',created_at
    ) order by created_at desc,id desc
  ),'[]'::jsonb)
  into transactions
  from page;

  return jsonb_build_object(
    'customer',jsonb_build_object(
      'id',customer_row.id::text,
      'maKH',customer_row.id::text,
      'ten',customer_row.display_name,
      'name',customer_row.display_name,
      'username',customer_row.username
    ),
    'soDu',current_balance,
    'balance',current_balance,
    'transactions',transactions
  );
end;
$$;
