-- Re-align TAPHOA identity counters after the Supabase cutover restore.

do $$
declare
  v_max bigint;
begin
  select max(id) into v_max from public.taphoa_product_outbox;
  if v_max is not null then perform setval('public.taphoa_product_outbox_id_seq'::regclass,v_max,true); end if;
end $$;
