-- Retire the empty pre-cutover generic order/debt runtime.
-- Canonical TAPHOA business data lives in taphoa_orders/taphoa_order_items/taphoa_debt_ledger.
-- This migration deliberately avoids CASCADE: any unexpected hard dependency must abort the migration.

begin;

do $$
declare
  v_unexpected text;
begin
  if to_regclass('public.taphoa_orders') is null
     or to_regclass('public.taphoa_order_items') is null
     or to_regclass('public.taphoa_debt_ledger') is null then
    raise exception 'canonical_taphoa_business_tables_missing';
  end if;

  if exists(select 1 from public.orders limit 1)
     or exists(select 1 from public.order_items limit 1)
     or exists(select 1 from public.debts limit 1) then
    raise exception 'legacy_generic_business_tables_not_empty';
  end if;

  select string_agg(format('%I(%s)',p.proname,pg_get_function_identity_arguments(p.oid)),', ' order by p.proname)
  into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (
      pg_get_functiondef(p.oid) ilike '%public.orders%'
      or pg_get_functiondef(p.oid) ilike '%public.order_items%'
      or pg_get_functiondef(p.oid) ilike '%public.debts%'
    )
    and p.proname not in (
      'getlink_approve_v21_order',
      'getlink_cancel_v21_order',
      'getlink_create_v21_order',
      'taphoa_add_debt',
      'taphoa_approve_order',
      'taphoa_approve_order_with_debt',
      'taphoa_cancel_order',
      'taphoa_cancel_pending_orders',
      'taphoa_create_order',
      'taphoa_create_order_with_debt',
      'taphoa_customer_daily_reconciliation',
      'taphoa_rebuild_all_summaries',
      'taphoa_rebuild_customer_daily_summary',
      'taphoa_refresh_customer_daily_summary',
      'taphoa_refresh_customer_product_summary',
      'taphoa_refresh_customer_summary',
      'taphoa_refresh_daily_summary',
      'taphoa_report_customer',
      'taphoa_report_overview',
      'taphoa_report_product_rank',
      'taphoa_summary_reconciliation',
      'taphoa_update_order'
    );

  if v_unexpected is not null then
    raise exception 'unexpected_legacy_generic_business_dependency: %',v_unexpected;
  end if;
end;
$$;

drop function if exists public.getlink_approve_v21_order(text,timestamptz,text);
drop function if exists public.getlink_cancel_v21_order(text,boolean,text);
drop function if exists public.getlink_create_v21_order(jsonb,jsonb);

drop function if exists public.taphoa_add_debt(jsonb);
drop function if exists public.taphoa_approve_order(text,timestamptz);
drop function if exists public.taphoa_approve_order_with_debt(text,timestamptz,text);
drop function if exists public.taphoa_cancel_order(text,boolean,text);
drop function if exists public.taphoa_cancel_pending_orders(text[]);
drop function if exists public.taphoa_create_order(jsonb,jsonb);
drop function if exists public.taphoa_create_order_with_debt(jsonb,jsonb,jsonb);
drop function if exists public.taphoa_customer_daily_reconciliation();
drop function if exists public.taphoa_rebuild_all_summaries();
drop function if exists public.taphoa_rebuild_customer_daily_summary();
drop function if exists public.taphoa_refresh_customer_daily_summary(text,date);
drop function if exists public.taphoa_refresh_customer_product_summary(text);
drop function if exists public.taphoa_refresh_customer_summary(text);
drop function if exists public.taphoa_refresh_daily_summary(date);
drop function if exists public.taphoa_report_customer(text,date,date);
drop function if exists public.taphoa_report_overview(date,date);
drop function if exists public.taphoa_report_product_rank(date,date,text);
drop function if exists public.taphoa_summary_reconciliation();
drop function if exists public.taphoa_update_order(jsonb,jsonb);

-- Dropping the empty tables removes their table-owned triggers/constraints.
-- No CASCADE is used so any unplanned external dependency blocks the migration.
drop table if exists public.order_items;
drop table if exists public.debts;
drop table if exists public.orders;

drop function if exists public.getlink_validate_debt_customer_identity();
drop function if exists public.taphoa_trg_normalize_debt();
drop function if exists public.taphoa_trg_normalize_order();
drop function if exists public.taphoa_trg_normalize_order_item();

commit;
