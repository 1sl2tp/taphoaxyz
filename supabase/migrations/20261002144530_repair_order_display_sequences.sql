-- Repair DG/DT display counters after Supabase cutover/restore.
-- Sequence state is not business data and can lag restored rows.

do $$
declare
  v_dg_max bigint;
  v_dt_max bigint;
begin
  select coalesce(max(display_no),0)
    into v_dg_max
  from public.taphoa_orders
  where display_prefix='DG';

  select coalesce(max(display_no),0)
    into v_dt_max
  from public.taphoa_orders
  where display_prefix='DT';

  if v_dg_max > 0 then
    perform setval('public.taphoa_order_display_no_dg_seq'::regclass,v_dg_max,true);
  else
    perform setval('public.taphoa_order_display_no_dg_seq'::regclass,1,false);
  end if;

  if v_dt_max > 0 then
    perform setval('public.taphoa_order_display_no_dt_seq'::regclass,v_dt_max,true);
  else
    perform setval('public.taphoa_order_display_no_dt_seq'::regclass,1,false);
  end if;
end $$;
