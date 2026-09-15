-- Retire the pre-namespaced TAPHOA business state after the independent
-- taphoa_* catalog has been populated successfully.
--
-- FK discovery on production showed that the six root business tables have
-- retired generic summary/session dependents. Delete those dependents
-- explicitly in dependency order. Shared V21 identity, Chat, and taphoa_*
-- business state are intentionally outside this mutation set.

do $$
begin
  if (select count(*) from public.taphoa_products) <= 0 then
    raise exception 'TAPHOA reset blocked: taphoa_products is empty';
  end if;

  if (select count(*) from public.taphoa_sources) <> 5 then
    raise exception 'TAPHOA reset blocked: expected five taphoa_sources';
  end if;

  if coalesce((select last_sync_status from public.taphoa_sheet_sync_state where id = 1), '') <> 'success' then
    raise exception 'TAPHOA reset blocked: latest sheet sync is not successful';
  end if;
end
$$;

delete from public.customer_product_summary;
delete from public.customer_daily_summary;
delete from public.customer_summary;
delete from public.sessions;
delete from public.debts;
delete from public.order_items;
delete from public.orders;
delete from public.daily_summary;
delete from public.products;
delete from public.product_sources;
delete from public.accounts;
