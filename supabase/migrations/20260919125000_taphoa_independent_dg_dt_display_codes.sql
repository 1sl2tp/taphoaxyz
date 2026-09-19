-- Independent human-facing order numbers for delivered and draft orders.
-- DG and DT use separate counters. UUID remains the internal identity.

create sequence if not exists public.taphoa_order_display_no_dg_seq as bigint start with 1 increment by 1;
create sequence if not exists public.taphoa_order_display_no_dt_seq as bigint start with 1 increment by 1;

alter table public.taphoa_orders
  add column if not exists display_prefix text;

-- Old unique display_no was shared by DG/DT. The new identity is prefix + number.
drop index if exists public.taphoa_orders_display_no_uidx;

-- Rebuild existing human numbers into independent streams.
-- Delivered/reversed orders consume DG numbers; pending orders consume DT numbers.
with ranked as (
  select
    id,
    case when status in ('delivered','reversed') then 'DG' else 'DT' end as next_prefix,
    row_number() over(
      partition by case when status in ('delivered','reversed') then 'DG' else 'DT' end
      order by created_at,id
    )::bigint as next_no
  from public.taphoa_orders
)
update public.taphoa_orders o
set display_prefix = ranked.next_prefix,
    display_no = ranked.next_no
from ranked
where ranked.id = o.id;

do $$
declare
  v_dg_max bigint;
  v_dt_max bigint;
begin
  select coalesce(max(display_no),0) into v_dg_max from public.taphoa_orders where display_prefix='DG';
  select coalesce(max(display_no),0) into v_dt_max from public.taphoa_orders where display_prefix='DT';

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

alter table public.taphoa_orders
  alter column display_prefix set not null,
  alter column display_no drop default,
  alter column display_no set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='taphoa_orders_display_prefix_chk'
      and conrelid='public.taphoa_orders'::regclass
  ) then
    alter table public.taphoa_orders
      add constraint taphoa_orders_display_prefix_chk check (display_prefix in ('DG','DT'));
  end if;
end $$;

create unique index if not exists taphoa_orders_display_prefix_no_uidx
  on public.taphoa_orders(display_prefix,display_no);

create or replace function public.taphoa_order_frontend_json(o public.taphoa_orders)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id',oi.id,
          'maSP',oi.product_code,
          'product_id',oi.product_code,
          'tenSP',p.product_name,
          'ten',p.product_name,
          'product_name',p.product_name,
          'sl',oi.qty,
          'qty',oi.qty,
          'gia',oi.unit_price_vnd::numeric / 1000.0,
          'unit_price',oi.unit_price_vnd::numeric / 1000.0,
          'von',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end,
          'unit_cost',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end,
          'nhom',p.source_key,
          'product_group',p.source_key,
          'lineNo',oi.line_no,
          'line_no',oi.line_no,
          'ghiChu',oi.note,
          'note',oi.note
        ) order by oi.line_no,oi.id
      ),'[]'::jsonb) as items,
      coalesce(sum(oi.qty),0) as total_qty,
      count(*)::integer as total_codes,
      coalesce(sum(oi.qty * oi.unit_price_vnd),0) as total_vnd,
      coalesce(sum(oi.qty * coalesce(p.input_price_vnd,0)),0) as cost_vnd
    from public.taphoa_order_items oi
    join public.taphoa_products p on p.product_code=oi.product_code
    where oi.order_id=o.id
  ), code as (
    select
      coalesce(nullif(o.display_prefix,''),case when o.status in ('delivered','reversed') then 'DG' else 'DT' end) as prefix,
      o.display_no as no
  )
  select jsonb_build_object(
    'id',o.id::text,
    'order_id',o.id::text,
    'backendOrderId',o.id::text,
    'displayPrefix',code.prefix,
    'display_prefix',code.prefix,
    'displayNo',code.no,
    'display_no',code.no,
    'displayCode',code.prefix || code.no::text,
    'display_code',code.prefix || code.no::text,
    'maDon',code.prefix || code.no::text,
    'maKH',case when o.customer_account_id is null then 'le' else o.customer_account_id::text end,
    'customer_id',case when o.customer_account_id is null then null else o.customer_account_id::text end,
    'tenKH',coalesce(c.display_name,'Khách lẻ'),
    'status',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'trangThai',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'note',o.note,
    'ghiChu',o.note,
    'ngay',coalesce(o.delivered_at,o.created_at),
    'ordered_at',o.created_at,
    'created_at',o.created_at,
    'delivered_at',o.delivered_at,
    'tongMa',l.total_codes,
    'tongSL',l.total_qty,
    'tongTien',l.total_vnd::numeric / 1000.0,
    'tongVon',l.cost_vnd::numeric / 1000.0,
    'loiNhuan',(l.total_vnd-l.cost_vnd)::numeric / 1000.0,
    'items',l.items
  )
  from lines l
  cross join code
  left join public.v21_accounts c on c.id=o.customer_account_id;
$$;

revoke all on function public.taphoa_order_frontend_json(public.taphoa_orders) from public;

create or replace function public.taphoa_save_order(p_order jsonb,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_customer uuid;
  v_customer_text text;
  v_status text;
  v_note text := coalesce(p_order->>'note','');
  v_edit_id uuid;
  v_order public.taphoa_orders;
  v_old_status text := null;
  v_old_customer uuid := null;
  v_prefix text;
  v_items integer := 0;
  v_expected integer := 0;
  v_total bigint := 0;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  v_customer_text := nullif(btrim(coalesce(p_order->>'customer_id','')),'');
  if lower(coalesce(v_customer_text,''))='le' then v_customer_text := null; end if;
  v_customer := v_customer_text::uuid;
  if v_customer is not null and not exists(
    select 1 from public.v21_accounts a
    where a.id=v_customer and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  v_status := case when lower(coalesce(p_order->>'status','pending')) in ('done','delivered') then 'delivered' else 'pending' end;
  v_edit_id := nullif(p_order->>'edit_order_id','')::uuid;
  v_expected := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    v_prefix := case when v_status='delivered' then 'DG' else 'DT' end;
    insert into public.taphoa_orders(customer_account_id,status,note,created_by_account_id,delivered_at,display_prefix,display_no)
    values(
      v_customer,
      v_status,
      v_note,
      (ctx->>'account_id')::uuid,
      case when v_status='delivered' then now() else null end,
      v_prefix,
      nextval((case when v_prefix='DG' then 'public.taphoa_order_display_no_dg_seq' else 'public.taphoa_order_display_no_dt_seq' end)::regclass)
    )
    returning * into v_order;
  else
    select * into v_order from public.taphoa_orders where id=v_edit_id for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_order.status='reversed' then raise exception 'order_reversed'; end if;
    v_old_status := v_order.status;
    v_old_customer := v_order.customer_account_id;
    if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'; end if;

    delete from public.taphoa_debt_ledger where order_id=v_order.id and entry_type='sale';
    delete from public.taphoa_order_items where order_id=v_order.id;
    update public.taphoa_orders
    set customer_account_id=v_customer,
        status=v_status,
        note=v_note,
        updated_at=now(),
        delivered_at=case when v_status='delivered' then coalesce(v_order.delivered_at,now()) else null end,
        display_prefix=case when v_old_status='pending' and v_status='delivered' then 'DG' else v_order.display_prefix end,
        display_no=case when v_old_status='pending' and v_status='delivered'
                        then nextval('public.taphoa_order_display_no_dg_seq'::regclass)
                        else v_order.display_no end
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into public.taphoa_order_items(order_id,product_code,qty,unit_price_vnd,line_no,note)
  select v_order.id,
         item->>'product_id',
         (item->>'qty')::numeric,
         round((item->>'unit_price')::numeric * 1000)::bigint,
         (item->>'line_no')::integer,
         coalesce(item->>'note','')
  from jsonb_array_elements(p_order->'items') item
  join public.taphoa_products p on p.product_code=item->>'product_id' and p.is_active
  where coalesce((item->>'qty')::numeric,0)>0
    and coalesce((item->>'unit_price')::numeric,-1)>=0
    and coalesce((item->>'line_no')::integer,0)>0;
  get diagnostics v_items=row_count;
  if v_items<>v_expected then raise exception 'invalid_order_items'; end if;

  if v_status='delivered' and v_customer is not null then
    select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
    from public.taphoa_order_items where order_id=v_order.id;
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',(ctx->>'account_id')::uuid);
  end if;

  perform public.taphoa_bump_revision('orders');
  if (v_old_status='delivered' and v_old_customer is not null)
     or (v_status='delivered' and v_customer is not null) then
    perform public.taphoa_bump_revision('debt');
  end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(v_order));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_deliver_order(p_order_id uuid,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  o public.taphoa_orders;
  v_total bigint;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  select * into o from public.taphoa_orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status<>'pending' then raise exception 'order_not_pending'; end if;

  update public.taphoa_orders
  set status='delivered',
      delivered_at=now(),
      updated_at=now(),
      display_prefix='DG',
      display_no=nextval('public.taphoa_order_display_no_dg_seq'::regclass)
  where id=o.id returning * into o;
  select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
  from public.taphoa_order_items where order_id=o.id;
  if v_total<=0 then raise exception 'order_total_invalid'; end if;

  if o.customer_account_id is not null then
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(o.customer_account_id,o.id,'sale',v_total,'Giao đơn',(ctx->>'account_id')::uuid);
    perform public.taphoa_bump_revision('debt');
  end if;
  perform public.taphoa_bump_revision('orders');

  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(o));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_save_order(jsonb,uuid) from public;
revoke all on function public.taphoa_deliver_order(uuid,uuid) from public;
