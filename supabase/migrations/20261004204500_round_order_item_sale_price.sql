-- Sale prices stored on order lines must be whole literal money units.
-- Round before persistence so stale/browser floating-point values such as
-- 268.97499999999997 cannot create fractional order/debt totals.

create or replace function public.taphoa_round_order_item_unit_price()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.unit_price_vnd is not null then
    new.unit_price_vnd := round(new.unit_price_vnd);
  end if;
  return new;
end;
$function$;

drop trigger if exists taphoa_order_items_round_unit_price_biu
on public.taphoa_order_items;

create trigger taphoa_order_items_round_unit_price_biu
before insert or update of unit_price_vnd
on public.taphoa_order_items
for each row
execute function public.taphoa_round_order_item_unit_price();

-- Repair the one production row that had already captured a stale fractional
-- Bim 5 price in DG47 and keep its debt-sale entry consistent with the order.
do $$
declare
  v_order_id uuid := '2845fb4f-7ce4-4532-9059-b1ce7efc9803'::uuid;
  v_total numeric;
  v_changed integer := 0;
begin
  update public.taphoa_order_items
  set unit_price_vnd=round(unit_price_vnd)
  where order_id=v_order_id
    and product_code='HT-000064'
    and unit_price_vnd is distinct from round(unit_price_vnd);

  get diagnostics v_changed=row_count;

  if v_changed>0 then
    select coalesce(sum(qty*unit_price_vnd),0)
    into v_total
    from public.taphoa_order_items
    where order_id=v_order_id;

    update public.taphoa_debt_ledger
    set amount_vnd=v_total
    where order_id=v_order_id
      and entry_type='sale';

    update public.taphoa_orders
    set updated_at=now()
    where id=v_order_id;

    perform public.taphoa_bump_revision('orders');
    perform public.taphoa_bump_revision('debt');
  end if;
end;
$$;
