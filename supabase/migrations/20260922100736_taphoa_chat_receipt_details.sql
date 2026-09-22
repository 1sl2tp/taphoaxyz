create or replace function public.taphoa_chat_money(p_amount_vnd bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(to_char(abs(coalesce(p_amount_vnd,0)),'FM999,999,999,999,990'),',','.') || 'đ';
$$;

create or replace function public.taphoa_chat_qty(p_qty numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(to_char(coalesce(p_qty,0),'FM999999990.###'));
$$;

create or replace function public.taphoa_chat_balance_label(p_balance_vnd bigint,p_before boolean default false)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(p_balance_vnd,0)>0 then
    return (case when p_before then 'Nợ trước: ' else 'Còn nợ: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  elsif coalesce(p_balance_vnd,0)<0 then
    return (case when p_before then 'Dư trước: ' else 'Còn dư: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  end if;
  return case when p_before then 'Trước giao dịch: 0đ' else 'Đã hết nợ: 0đ' end;
end;
$$;

create or replace function public.taphoa_chat_customer_balance_vnd(p_customer_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(l.amount_vnd),0)::bigint
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id;
$$;

create or replace function public.taphoa_chat_order_lines(p_order_json jsonb,p_limit integer default 5)
returns text
language sql
immutable
set search_path = public
as $$
  with items as (
    select
      ord,
      coalesce(nullif(item->>'product_name',''),nullif(item->>'tenSP',''),nullif(item->>'ten',''),'Sản phẩm') as name,
      coalesce(nullif(item->>'qty','')::numeric,nullif(item->>'sl','')::numeric,0) as qty
    from jsonb_array_elements(coalesce(p_order_json->'items','[]'::jsonb)) with ordinality e(item,ord)
  ), picked as (
    select * from items order by ord limit greatest(coalesce(p_limit,5),1)
  ), counts as (
    select count(*)::integer as total from items
  )
  select case
    when counts.total=0 then ''
    else coalesce((select string_agg(name || ' ×' || public.taphoa_chat_qty(qty),' · ' order by ord) from picked),'')
      || case when counts.total>greatest(coalesce(p_limit,5),1)
              then ' · +' || (counts.total-greatest(coalesce(p_limit,5),1))::text || ' dòng'
              else '' end
  end
  from counts;
$$;

create or replace function public.taphoa_chat_order_receipt(
  p_order_json jsonb,
  p_heading text,
  p_balance_vnd bigint default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_total_vnd bigint := round(coalesce(nullif(p_order_json->>'tongTien','')::numeric,0)*1000)::bigint;
  v_codes text := coalesce(nullif(p_order_json->>'tongMa',''),'0');
  v_qty text := public.taphoa_chat_qty(coalesce(nullif(p_order_json->>'tongSL','')::numeric,0));
  v_lines text := public.taphoa_chat_order_lines(p_order_json,5);
  v_body text;
begin
  v_body := btrim(coalesce(p_heading,'')) || E'\n'
    || v_codes || ' mã · SL ' || v_qty || ' · ' || public.taphoa_chat_money(v_total_vnd);
  if btrim(coalesce(v_lines,''))<>'' then
    v_body := v_body || E'\n' || v_lines;
  end if;
  if p_balance_vnd is not null then
    v_body := v_body || E'\n' || public.taphoa_chat_balance_label(p_balance_vnd,false);
  end if;
  return v_body;
end;
$$;

create or replace function public.taphoa_chat_order_diff(p_old jsonb,p_new jsonb,p_limit integer default 6)
returns text
language sql
immutable
set search_path = public
as $$
  with old_items as (
    select
      coalesce(nullif(item->>'product_id',''),nullif(item->>'maSP','')) as product_id,
      max(coalesce(nullif(item->>'product_name',''),nullif(item->>'tenSP',''),nullif(item->>'ten',''),'Sản phẩm')) as name,
      sum(coalesce(nullif(item->>'qty','')::numeric,nullif(item->>'sl','')::numeric,0)) as qty,
      max(coalesce(nullif(item->>'unit_price','')::numeric,nullif(item->>'gia','')::numeric,0)) as price_thousand
    from jsonb_array_elements(coalesce(p_old->'items','[]'::jsonb)) item
    group by 1
  ), new_items as (
    select
      coalesce(nullif(item->>'product_id',''),nullif(item->>'maSP','')) as product_id,
      max(coalesce(nullif(item->>'product_name',''),nullif(item->>'tenSP',''),nullif(item->>'ten',''),'Sản phẩm')) as name,
      sum(coalesce(nullif(item->>'qty','')::numeric,nullif(item->>'sl','')::numeric,0)) as qty,
      max(coalesce(nullif(item->>'unit_price','')::numeric,nullif(item->>'gia','')::numeric,0)) as price_thousand
    from jsonb_array_elements(coalesce(p_new->'items','[]'::jsonb)) item
    group by 1
  ), changed as (
    select
      row_number() over(order by coalesce(n.name,o.name),coalesce(n.product_id,o.product_id)) as rn,
      coalesce(n.name,o.name,'Sản phẩm') as name,
      o.qty as old_qty,n.qty as new_qty,
      o.price_thousand as old_price,n.price_thousand as new_price
    from old_items o
    full outer join new_items n using(product_id)
    where o.product_id is null
       or n.product_id is null
       or o.qty is distinct from n.qty
       or o.price_thousand is distinct from n.price_thousand
  ), lines as (
    select rn,
      case
        when old_qty is null then name || ': thêm ×' || public.taphoa_chat_qty(new_qty)
          || case when coalesce(new_price,0)>0 then ' · ' || public.taphoa_chat_money(round(new_price*1000)::bigint) else '' end
        when new_qty is null then name || ': ×' || public.taphoa_chat_qty(old_qty) || ' → bỏ'
        else name || ': '
          || concat_ws(' · ',
            case when old_qty is distinct from new_qty
                 then 'SL ' || public.taphoa_chat_qty(old_qty) || ' → ' || public.taphoa_chat_qty(new_qty) end,
            case when old_price is distinct from new_price
                 then 'Giá ' || public.taphoa_chat_money(round(old_price*1000)::bigint)
                   || ' → ' || public.taphoa_chat_money(round(new_price*1000)::bigint) end
          )
      end as line
    from changed
  ), counts as (
    select count(*)::integer total from changed
  )
  select coalesce((
    select string_agg(line,E'\n' order by rn)
    from lines
    where rn<=greatest(coalesce(p_limit,6),1)
  ),'')
  || case when counts.total>greatest(coalesce(p_limit,6),1)
          then E'\n+' || (counts.total-greatest(coalesce(p_limit,6),1))::text || ' thay đổi khác'
          else '' end
  from counts;
$$;

revoke all on function public.taphoa_chat_money(bigint) from public,anon,authenticated;
revoke all on function public.taphoa_chat_qty(numeric) from public,anon,authenticated;
revoke all on function public.taphoa_chat_balance_label(bigint,boolean) from public,anon,authenticated;
revoke all on function public.taphoa_chat_customer_balance_vnd(uuid) from public,anon,authenticated;
revoke all on function public.taphoa_chat_order_lines(jsonb,integer) from public,anon,authenticated;
revoke all on function public.taphoa_chat_order_receipt(jsonb,text,bigint) from public,anon,authenticated;
revoke all on function public.taphoa_chat_order_diff(jsonb,jsonb,integer) from public,anon,authenticated;

create or replace function public.taphoa_save_order(p_order jsonb,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_account_id uuid := nullif(ctx->>'account_id','')::uuid;
  v_role text := coalesce(ctx->>'taphoa_role','');
  v_customer uuid;
  v_customer_text text;
  v_status text;
  v_note text := coalesce(p_order->>'note','');
  v_edit_id uuid;
  v_order public.taphoa_orders;
  v_old_status text := null;
  v_old_customer uuid := null;
  v_old_costs jsonb := '{}'::jsonb;
  v_old_order_json jsonb := null;
  v_prefix text;
  v_items integer := 0;
  v_expected integer := 0;
  v_total bigint := 0;
  v_order_json jsonb;
  v_display_code text;
  v_notice text;
  v_diff text;
  v_old_total_vnd bigint := 0;
  v_new_total_vnd bigint := 0;
  v_balance_before bigint;
  v_balance_after bigint;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or v_role not in ('admin','customer') then
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
  if v_role='customer' then
    if v_status <> 'pending' then raise exception 'customer_orders_pending_only' using errcode='42501'; end if;
    if v_customer is distinct from v_account_id then raise exception 'customer_order_wrong_account' using errcode='42501'; end if;
  end if;

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
      v_account_id,
      case when v_status='delivered' then now() else null end,
      v_prefix,
      nextval((case when v_prefix='DG' then 'public.taphoa_order_display_no_dg_seq' else 'public.taphoa_order_display_no_dt_seq' end)::regclass)
    )
    returning * into v_order;
  else
    select * into v_order from public.taphoa_orders where id=v_edit_id for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_role='customer' and (
      v_order.customer_account_id is distinct from v_account_id
      or v_order.status <> 'pending'
    ) then raise exception 'customer_order_not_allowed' using errcode='42501'; end if;
    if v_order.status='reversed' then raise exception 'order_reversed'; end if;
    v_old_status := v_order.status;
    v_old_customer := v_order.customer_account_id;
    v_old_order_json := public.taphoa_order_frontend_json(v_order);
    if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'; end if;

    if v_old_status='delivered' and v_old_customer is not null and v_old_customer is not distinct from v_customer then
      v_balance_before := public.taphoa_chat_customer_balance_vnd(v_old_customer);
    end if;

    select coalesce(jsonb_object_agg(product_code,unit_cost_vnd_snapshot),'{}'::jsonb)
    into v_old_costs
    from public.taphoa_order_items
    where order_id=v_order.id;

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

  insert into public.taphoa_order_items(order_id,product_code,qty,unit_price_vnd,unit_cost_vnd_snapshot,line_no,note)
  select v_order.id,
         item->>'product_id',
         (item->>'qty')::numeric,
         round((item->>'unit_price')::numeric * 1000)::bigint,
         coalesce(
           nullif(v_old_costs->>(item->>'product_id'),'')::bigint,
           p.input_price_vnd,
           0
         ),
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
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',v_account_id);
  end if;

  perform public.taphoa_bump_revision('orders');
  if (v_old_status='delivered' and v_old_customer is not null)
     or (v_status='delivered' and v_customer is not null) then
    perform public.taphoa_bump_revision('debt');
  end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_order_json := public.taphoa_order_frontend_json(v_order);
  v_display_code := coalesce(nullif(v_order_json->>'displayCode',''),v_order.id::text);
  v_new_total_vnd := round(coalesce(nullif(v_order_json->>'tongTien','')::numeric,0)*1000)::bigint;
  if v_customer is not null then
    v_balance_after := public.taphoa_chat_customer_balance_vnd(v_customer);
  end if;
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  if v_role='admin' and v_customer is not null then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã giao',
          v_balance_after
        );
      else
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã được tạo',
          null
        );
      end if;
    elsif v_old_status='pending' and v_status='delivered' then
      v_notice := public.taphoa_chat_order_receipt(
        v_order_json,
        'Đơn ' || v_display_code || ' đã giao',
        v_balance_after
      );
    else
      v_diff := public.taphoa_chat_order_diff(v_old_order_json,v_order_json,6);
      v_old_total_vnd := round(coalesce(nullif(v_old_order_json->>'tongTien','')::numeric,0)*1000)::bigint;
      v_notice := 'Đơn ' || v_display_code || ' đã được sửa';

      if btrim(coalesce(v_diff,''))<>'' then
        v_notice := v_notice || E'\n' || v_diff;
      end if;

      if v_old_total_vnd is distinct from v_new_total_vnd then
        v_notice := v_notice || E'\nTổng: '
          || public.taphoa_chat_money(v_old_total_vnd)
          || ' → '
          || public.taphoa_chat_money(v_new_total_vnd);
      end if;

      if coalesce(v_old_order_json->>'note','') is distinct from coalesce(v_order_json->>'note','') then
        v_notice := v_notice || E'\nGhi chú: '
          || case when btrim(coalesce(v_old_order_json->>'note',''))='' then '(trống)' else left(v_old_order_json->>'note',80) end
          || ' → '
          || case when btrim(coalesce(v_order_json->>'note',''))='' then '(trống)' else left(v_order_json->>'note',80) end;
      end if;

      if btrim(coalesce(v_diff,''))='' and v_old_total_vnd is not distinct from v_new_total_vnd
         and coalesce(v_old_order_json->>'note','') is not distinct from coalesce(v_order_json->>'note','') then
        v_notice := v_notice || E'\nKhông có thay đổi nội dung.';
      end if;

      if v_status='delivered' then
        if v_balance_before is not null and v_balance_before is distinct from v_balance_after then
          v_notice := v_notice || E'\n' || public.taphoa_chat_balance_label(v_balance_before,true);
        end if;
        v_notice := v_notice || E'\n' || public.taphoa_chat_balance_label(v_balance_after,false);
      end if;
    end if;

    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,
      'taphoa:' || p_command_id::text || ':order',
      v_notice
    );
  end if;

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
  v_order_json jsonb;
  v_display_code text;
  v_balance_after bigint;
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

  v_order_json := public.taphoa_order_frontend_json(o);
  v_display_code := coalesce(nullif(v_order_json->>'displayCode',''),o.id::text);
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  if o.customer_account_id is not null then
    v_balance_after := public.taphoa_chat_customer_balance_vnd(o.customer_account_id);
    perform public.taphoa_chat_notify_customer(
      o.customer_account_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':deliver',
      public.taphoa_chat_order_receipt(
        v_order_json,
        'Đơn ' || v_display_code || ' đã giao',
        v_balance_after
      )
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_debt_transaction(
  p_customer_id uuid,
  p_type text,
  p_amount numeric,
  p_note text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_amount_vnd bigint;
  v_entry_type text;
  v_signed bigint;
  v_balance_before bigint;
  v_balance_after bigint;
  v_notice text;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'amount_must_be_positive'; end if;

  v_amount_vnd := round(p_amount * 1000)::bigint;
  if lower(coalesce(p_type,''))='collection' then
    v_entry_type := 'collection';
    v_signed := -v_amount_vnd;
  elsif lower(coalesce(p_type,''))='payment' then
    v_entry_type := 'payment';
    v_signed := v_amount_vnd;
  else
    v_entry_type := 'adjustment';
    v_signed := v_amount_vnd;
  end if;

  v_balance_before := public.taphoa_chat_customer_balance_vnd(p_customer_id);

  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
  values(p_customer_id,v_entry_type,v_signed,coalesce(p_note,''),(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('debt');

  v_balance_after := public.taphoa_chat_customer_balance_vnd(p_customer_id);
  v_result := jsonb_build_object('ok',true,'customer_id',p_customer_id::text,'movement',v_signed::numeric/1000.0);

  if v_entry_type='collection' then
    v_notice := 'Đã thu ' || public.taphoa_chat_money(v_amount_vnd)
      || E'\n' || public.taphoa_chat_balance_label(v_balance_before,true)
      || E'\n' || public.taphoa_chat_balance_label(v_balance_after,false);

    if btrim(coalesce(p_note,''))<>'' then
      v_notice := v_notice || E'\nGhi chú: ' || left(btrim(p_note),120);
    end if;

    perform public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':collection',
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'debt_transaction',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_save_order(jsonb,uuid) from public;
revoke all on function public.taphoa_deliver_order(uuid,uuid) from public;
revoke all on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) from public;

grant execute on function public.taphoa_save_order(jsonb,uuid) to authenticated;
grant execute on function public.taphoa_deliver_order(uuid,uuid) to authenticated;
grant execute on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) to authenticated;