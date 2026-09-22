begin;

alter table public.taphoa_stock_check_sessions
  add column if not exists pending_order_id uuid
    references public.taphoa_orders(id) on delete set null;

create or replace function public.taphoa_public_save_stock_draft(
  p_public_slug text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_public_slug,'')));
  v_customer uuid;
  v_session public.taphoa_stock_check_sessions;
  v_order public.taphoa_orders;
  v_created boolean := false;
  v_expected integer := 0;
  v_inserted integer := 0;
  v_result jsonb;
begin
  if v_slug='' then raise exception 'customer_not_found'; end if;

  select l.customer_account_id
  into v_customer
  from public.v21_customer_public_links l
  join public.v21_accounts a on a.id=l.customer_account_id
  where l.public_slug=v_slug
    and l.revoked_at is null
    and a.role='user'
    and a.contact_group='customer'
    and a.deleted_at is null
    and a.locked_at is null
  limit 1;

  if v_customer is null then raise exception 'customer_not_found'; end if;

  select *
  into v_session
  from public.taphoa_stock_check_sessions s
  where s.customer_account_id=v_customer
  order by s.updated_at desc,s.created_at desc
  limit 1
  for update;

  if not found then raise exception 'stock_session_not_found'; end if;

  select count(*)
  into v_expected
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) item
  where btrim(coalesce(item->>'product_code',''))<>''
    and coalesce(nullif(item->>'qty','')::numeric,0)>0;

  if v_expected<1 then raise exception 'order_items_required'; end if;
  if v_expected>500 then raise exception 'too_many_items'; end if;

  if v_session.pending_order_id is not null then
    select *
    into v_order
    from public.taphoa_orders o
    where o.id=v_session.pending_order_id
      and o.customer_account_id=v_customer
      and o.status='pending'
    for update;
  end if;

  if v_order.id is null then
    insert into public.taphoa_orders(
      customer_account_id,status,note,created_by_account_id,
      display_prefix,display_no
    )
    values(
      v_customer,'pending','',v_customer,
      'DT',nextval('public.taphoa_order_display_no_dt_seq'::regclass)
    )
    returning * into v_order;
    v_created := true;
  else
    delete from public.taphoa_order_items where order_id=v_order.id;
    update public.taphoa_orders
    set updated_at=now()
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into public.taphoa_order_items(
    order_id,product_code,qty,unit_price_vnd,unit_cost_vnd_snapshot,line_no,note
  )
  select
    v_order.id,
    p.product_code,
    (x.item->>'qty')::numeric,
    coalesce(p.sale_price_vnd,0),
    coalesce(p.input_price_vnd,0),
    x.ord::integer,
    ''
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as x(item,ord)
  join public.taphoa_products p
    on p.product_code=btrim(x.item->>'product_code')
   and p.is_active
   and p.deleted_at is null
  where coalesce(nullif(x.item->>'qty','')::numeric,0)>0;

  get diagnostics v_inserted=row_count;
  if v_inserted<>v_expected then raise exception 'invalid_order_items'; end if;

  update public.taphoa_stock_check_sessions
  set pending_order_id=v_order.id,updated_at=now()
  where id=v_session.id;

  perform public.taphoa_bump_revision('orders');

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_result := jsonb_build_object(
    'ok',true,
    'created',v_created,
    'order',public.taphoa_order_frontend_json(v_order)
  );
  return v_result;
end;
$$;

revoke all on function public.taphoa_public_save_stock_draft(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.taphoa_public_save_stock_draft(text,jsonb)
  to service_role;

commit;
