-- Customer order notifications are delivered-order only.
-- Pending/temporary orders are an internal Admin workflow and never notify customers.

CREATE OR REPLACE FUNCTION public.taphoa_save_order(p_order jsonb, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
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
  v_total numeric := 0;
  v_order_json jsonb;
  v_display_code text;
  v_notice text;
  v_diff text;
  v_old_total_vnd numeric := 0;
  v_new_total_vnd numeric := 0;
  v_balance_before numeric;
  v_balance_after numeric;
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
      v_balance_before := public.taphoa_chat_customer_balance_value(v_old_customer);
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
         (item->>'unit_price')::numeric,
         coalesce(
           nullif(v_old_costs->>(item->>'product_id'),'')::numeric,
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
    select coalesce(sum(qty*unit_price_vnd),0) into v_total
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
  v_new_total_vnd := coalesce(nullif(v_order_json->>'tongTien','')::numeric,0);
  if v_customer is not null then
    v_balance_after := public.taphoa_chat_customer_balance_value(v_customer);
  end if;
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  if v_role='admin' and v_customer is not null and v_status='delivered' then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã giao', null::bigint);
      else
        v_notice := null;
      end if;
    elsif v_old_status='pending' and v_status='delivered' then
      v_notice := public.taphoa_chat_order_receipt(
        v_order_json,
        'Đơn ' || v_display_code || ' đã giao', null::bigint);
    else
      v_diff := public.taphoa_chat_order_diff(v_old_order_json,v_order_json,6);
      v_old_total_vnd := coalesce(nullif(v_old_order_json->>'tongTien','')::numeric,0);
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
