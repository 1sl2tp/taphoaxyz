-- APPROVED-NOTICE-251 / 2026-11-06.
-- User approved five customer business notice text templates.
-- Invariants: no new cron, no backfill, no new message, no ledger write beyond
-- existing transaction flow, no extra Zalo egress. Order images still attach
-- by the existing authenticated TAPHOA_ORDER_PORTRAIT ticket/asset owner.
-- The bank auto collection image is NOT created here; generating that secure
-- PNG from server-side snapshot requires a separate audited media pipeline.
-- Only future messages are formatted differently; historical text is immutable.

-- APPROVED-NOTICE-251: Pure formatter. No DB read/write, no payment mutation,
-- no notification by itself. Amounts remain in TAPHOA's thousands convention.
CREATE OR REPLACE FUNCTION public.taphoa_chat_finance_notice(
  p_kind text, p_amount numeric, p_before numeric, p_after numeric,
  p_method text, p_note text, p_url text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_body text;
  v_note text:=left(btrim(coalesce(p_note,'')),120);
  v_method text:=left(btrim(coalesce(p_method,'')),60);
BEGIN
  IF p_kind NOT IN ('collection','payment') THEN
    RAISE EXCEPTION 'unsupported_finance_notice_kind' USING errcode='22023';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION 'invalid_finance_notice_amount' USING errcode='22023';
  END IF;
  v_title:=CASE p_kind WHEN 'collection'
    THEN '✅ XÁC NHẬN ĐÃ THU TIỀN'
    ELSE '🧾 THÔNG BÁO GHI NỢ' END;
  v_body:=v_title||E'\n'
    ||(CASE WHEN p_kind='collection' THEN '💰 Số tiền đã thu: '
       ELSE '💰 Phát sinh: ' END)
    ||public.taphoa_chat_money(p_amount);
  IF p_kind='collection' AND v_method<>'' THEN
    v_body:=v_body||E'\n🏦 Hình thức: '||v_method;
  END IF;
  v_body:=v_body
    ||E'\n📊 '||public.taphoa_chat_balance_label(p_before,true)
    ||E'\n📊 '||public.taphoa_chat_balance_label(p_after,false);
  IF v_note<>'' THEN
    v_body:=v_body||E'\n📝 Ghi chú: '||v_note;
  END IF;
  IF nullif(btrim(coalesce(p_url,'')),'') IS NOT NULL THEN
    v_body:=v_body||E'\nXem công nợ: '||btrim(p_url);
  END IF;
  v_body:=v_body||E'\n'
    ||(CASE WHEN p_kind='collection'
      THEN 'Cảm ơn anh/chị đã thanh toán! ❤️'
      ELSE 'Anh/chị có thể xem lại chi tiết trong bảng công nợ ạ.' END);
  RETURN v_body;
END;
$function$;
REVOKE ALL ON FUNCTION public.taphoa_chat_finance_notice(
  text,numeric,numeric,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_chat_finance_notice(
  text,numeric,numeric,numeric,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.taphoa_chat_order_receipt(p_order_json jsonb, p_heading text, p_balance_vnd bigint DEFAULT NULL::bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_vnd numeric := coalesce(nullif(p_order_json->>'tongTien','')::numeric,0);
  v_codes text := coalesce(nullif(p_order_json->>'tongMa',''),'0');
  v_qty text := public.taphoa_chat_qty(coalesce(nullif(p_order_json->>'tongSL','')::numeric,0));
  v_code text := coalesce(nullif(p_order_json->>'displayCode',''),nullif(p_order_json->>'display_code',''),nullif(p_order_json->>'maDon',''),'--');
  v_customer uuid := nullif(p_order_json->>'customer_id','')::uuid;
  v_order_id uuid := nullif(coalesce(p_order_json->>'order_id',p_order_json->>'id'),'')::uuid;
  v_kind text;
  v_url text;
  v_body text;
begin
  v_kind := case
    when lower(btrim(coalesce(p_heading,''))) like '%sửa%'
      or lower(btrim(coalesce(p_heading,''))) like '%cập nhật%'
      then '✏️ ĐƠN HÀNG ĐÃ CẬP NHẬT'
    when lower(btrim(coalesce(p_heading,''))) like '%chuyển%'
      then '✅ ĐƠN HÀNG ĐÃ ĐƯỢC GIAO'
    when lower(btrim(coalesce(p_heading,''))) like '%gửi lại%'
      then '📋 GỬI LẠI ĐƠN HÀNG'
    when lower(btrim(coalesce(p_heading,''))) like '%giao%'
      then '📦 ĐƠN HÀNG ĐÃ GIAO'
    else '📋 ĐƠN HÀNG'
  end;
  -- APPROVED-NOTICE-251: concise text + canonical saved-order PNG.
  -- Preserve exact 'Xem đơn:' link for existing link handlers.
  v_body := v_kind || ' · ' || v_code || E'\n'
    || '📦 ' || v_codes || ' mã · ' || v_qty || ' sản phẩm'
    || E'\n💰 Tổng tiền: '||public.taphoa_chat_money(v_total_vnd);

  if v_customer is not null and v_order_id is not null and v_code<>'--' then
    v_url := public.taphoa_customer_mini_link(v_customer,'don',null,null,v_code);
    if v_url is not null then
      v_body := v_body || E'\nXem đơn: ' || v_url;
    end if;
  end if;

  if v_kind in ('📦 ĐƠN HÀNG ĐÃ GIAO','✅ ĐƠN HÀNG ĐÃ ĐƯỢC GIAO') then
    v_body:=v_body||E'\nCảm ơn anh/chị đã ủng hộ! ❤️';
  elsif v_kind='✏️ ĐƠN HÀNG ĐÃ CẬP NHẬT' then
    v_body:=v_body||E'\nAnh/chị vui lòng xem lại đơn đã cập nhật giúp em ạ.';
  end if;
  return v_body;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_debt_transaction(p_customer_id uuid, p_type text, p_amount numeric, p_note text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_amount_vnd numeric;
  v_entry_type text;
  v_signed numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_notice text;
  v_url text;
  v_result jsonb;
  v_sent_message uuid;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then
    -- SPEC-FINANCE-REPLAY-PAYLOAD-20261101:
    -- A retry is idempotent only for the SAME customer, kind and amount.
    -- Reused command ids with different money inputs must not report success.
    if (prior->>'customer_id') is distinct from p_customer_id::text
       or (prior->>'receipt_kind') is distinct from lower(coalesce(p_type,''))
       or nullif(prior->>'amount_vnd','')::numeric is distinct from p_amount then
      raise exception 'debt_command_payload_conflict' using errcode='22023';
    end if;
    return prior;
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'amount_must_be_positive';
  end if;

  if p_amount<>trunc(p_amount) then
    raise exception 'amount_must_be_whole_number';
  end if;

  -- SPEC-DEBT-FAIL-CLOSED-TYPE-20261101:
  -- Reject unknown transaction types before recording finance mutations.
  if lower(coalesce(p_type,'')) not in ('collection','payment') then
    raise exception 'invalid_debt_transaction_type' using errcode='22023';
  end if;

  v_amount_vnd := p_amount;
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

  -- SPEC-FINANCE-SAME-CUSTOMER-RECEIPT-20261101:
  -- Serializes concurrent manual Web/PWA transactions for one customer
  -- before capturing the before/after debt balances.
  perform pg_advisory_xact_lock(hashtextextended('taphoa-money:' || p_customer_id::text,0));
  v_balance_before := public.taphoa_chat_customer_balance_value(p_customer_id);

  insert into public.taphoa_debt_ledger(
    customer_account_id,entry_type,amount_vnd,note,created_by_account_id
  )
  values(
    p_customer_id,v_entry_type,v_signed,coalesce(p_note,''),
    (ctx->>'account_id')::uuid
  );
  perform public.taphoa_bump_revision('debt');

  v_balance_after := public.taphoa_chat_customer_balance_value(p_customer_id);
  -- Capture the exact transactional snapshot for the paired PNG.
  -- It must not be reconstructed by reading a potentially newer ledger.
  v_result := jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id::text,
    'movement',v_signed,
    'receipt_kind',v_entry_type,
    'amount_vnd',v_amount_vnd,
    'balance_before_vnd',v_balance_before,
    'balance_after_vnd',v_balance_after,
    'receipt_note',left(btrim(coalesce(p_note,'')),120),
    'receipt_at',now()
  );

  if v_entry_type='collection' then
    v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
    v_notice:=public.taphoa_chat_finance_notice(
      'collection',v_amount_vnd,v_balance_before,v_balance_after,
      'Tiền mặt',p_note,v_url);
    v_sent_message := public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':collection',
      v_notice
    );

  elsif v_entry_type='payment' then
    v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
    v_notice:=public.taphoa_chat_finance_notice(
      'payment',v_amount_vnd,v_balance_before,v_balance_after,
      '',p_note,v_url);
    v_sent_message := public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':debt',
      v_notice
    );
  end if;

  -- Disabled notifications must not trigger an extra ticket/upload request.
  v_result := v_result || jsonb_build_object('notice_sent',v_sent_message IS NOT NULL);
  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'debt_transaction',v_result);

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_save_order(p_order jsonb, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
  v_refresh_costs boolean := coalesce((p_order->>'refresh_cost_snapshot')::boolean,false);
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
  if v_refresh_costs and (v_role <> 'admin' or v_edit_id is null or v_status <> 'pending') then
    raise exception 'draft_cost_refresh_admin_only' using errcode='42501';
  end if;
  v_expected := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    -- SPEC-ORDER-FINANCE-CUSTOMER-LOCK-20261101: new directly
    -- delivered orders must participate in customer ledger serialization.
    if v_status='delivered' and v_customer is not null then
      perform pg_advisory_xact_lock(hashtextextended('taphoa-money:' || v_customer::text,0));
    end if;
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
    if v_refresh_costs and v_old_status <> 'pending' then
      raise exception 'draft_cost_refresh_pending_only' using errcode='42501';
    end if;
    v_old_customer := v_order.customer_account_id;
    -- SPEC-ORDER-FINANCE-CUSTOMER-LOCK-20261101: when a delivered
    -- order changes customer, take BOTH locks in UUID text order to
    -- prevent two simultaneous customer transfers from deadlocking.
    if v_old_status='delivered' or v_status='delivered' then
      if v_old_customer is not null and v_customer is not null
         and v_old_customer<>v_customer then
        perform pg_advisory_xact_lock(hashtextextended(
          'taphoa-money:' || least(v_old_customer::text,v_customer::text),0));
        perform pg_advisory_xact_lock(hashtextextended(
          'taphoa-money:' || greatest(v_old_customer::text,v_customer::text),0));
      elsif coalesce(v_old_customer,v_customer) is not null then
        perform pg_advisory_xact_lock(hashtextextended(
          'taphoa-money:' || coalesce(v_old_customer,v_customer)::text,0));
      end if;
    end if;
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
         case when v_refresh_costs
           then coalesce(p.input_price_vnd,0)
           else coalesce(nullif(v_old_costs->>(item->>'product_id'),'')::numeric,
                         p.input_price_vnd,0)
         end,
         (item->>'line_no')::integer,
         coalesce(item->>'note','')
  from jsonb_array_elements(p_order->'items') item
  -- SPEC-ARCHIVED-DELIVERED-LINE-EDIT-20261101:
  -- Admin may preserve a product ALREADY present on a delivered order,
  -- even if that product was later archived. New inactive items stay blocked.
  join public.taphoa_products p on p.product_code=item->>'product_id'
    and (p.is_active or (
      v_role='admin' and v_edit_id is not null and v_old_status='delivered'
      and v_old_costs ? (item->>'product_id')
    ))
  where coalesce((item->>'qty')::numeric,0)>0
    and coalesce((item->>'unit_price')::numeric,-1)>=0
    and coalesce((item->>'line_no')::integer,0)>0;
  get diagnostics v_items=row_count;
  if v_items<>v_expected then raise exception 'invalid_order_items'; end if;

  -- SPEC-DELIVERED-NONZERO-ALL-CUSTOMERS-20261101:
  -- Direct saves and draft promotions must obey the same positive-total
  -- requirement as taphoa_deliver_order, including walk-in sales.
  if v_status='delivered' then
    select coalesce(sum(qty*unit_price_vnd),0) into v_total
    from public.taphoa_order_items where order_id=v_order.id;
    if v_total<=0 then raise exception 'order_total_invalid'; end if;
    -- SPEC-DELIVERY-MISSING-COST-20261101: pending orders may be drafted
    -- without cost; finalized sales must not silently fake zero cost.
    if exists(
      select 1 from public.taphoa_order_items i
      join public.taphoa_products p on p.product_code=i.product_code
      where i.order_id=v_order.id and i.unit_price_vnd>0
        and i.unit_cost_vnd_snapshot=0 and p.input_price_vnd is distinct from 0
    ) then raise exception 'order_cost_missing' using errcode='22023'; end if;
  end if;

  if v_status='delivered' and v_customer is not null then
    -- A correction to an already delivered order is NOT a new delivery.
    -- Keep the delivery timestamp when the sale ledger row is regenerated.
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id,created_at)
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',v_account_id,
           coalesce(v_order.delivered_at,now()));
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

  -- Only orders in delivered state can generate automatic order notices.
  -- Pending draft creation, edits and deletion never notify customers.
  if v_role='admin' and v_customer is not null and v_status='delivered' then
    if v_edit_id is null then
      v_notice := public.taphoa_chat_order_receipt(
        v_order_json,
        'Đơn ' || v_display_code || ' đã giao', null::bigint);
    elsif v_old_status='pending' and v_status='delivered' then
      v_notice := public.taphoa_chat_order_receipt(
        v_order_json,
        'Chuyển đơn tạm → đã giao', null::bigint);
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

    -- CYCLE-196: append policy to the EXISTING delivered-order receipt;
    -- pending orders and corrections to delivered orders never start a cycle.
    if v_edit_id is null or (v_old_status='pending' and v_status='delivered') then
      v_notice := v_notice || coalesce(
        v21_private.taphoa_order_cycle_policy_note(v_customer,v_order.id),'');
    end if;

    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,
      'taphoa:' || p_command_id::text ||
        case
          when v_edit_id is not null and v_old_status='pending' and v_status='delivered'
            then ':deliver'
          when v_edit_id is not null then ':order-edit'
          else ':order'
        end,
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_deliver_order(p_order_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  o public.taphoa_orders;
  v_total numeric;
  v_order_json jsonb;
  v_display_code text;
  v_balance_after numeric;
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
  -- SPEC-ORDER-FINANCE-CUSTOMER-LOCK-20261101: serialize posting a
  -- delivered sale with all other customer debt writers.
  if o.customer_account_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('taphoa-money:' || o.customer_account_id::text,0));
  end if;

  update public.taphoa_orders
  set status='delivered',
      delivered_at=now(),
      updated_at=now(),
      display_prefix='DG',
      display_no=nextval('public.taphoa_order_display_no_dg_seq'::regclass)
  where id=o.id returning * into o;
  select coalesce(sum(qty*unit_price_vnd),0) into v_total
  from public.taphoa_order_items where order_id=o.id;
  if v_total<=0 then raise exception 'order_total_invalid'; end if;
  -- SPEC-DELIVERY-MISSING-COST-20261101: snapshot cost 0 with missing
  -- or positive catalog cost must not be reported as known zero cost.
  if exists(
    select 1 from public.taphoa_order_items i
    join public.taphoa_products p on p.product_code=i.product_code
    where i.order_id=o.id and i.unit_price_vnd>0
      and i.unit_cost_vnd_snapshot=0 and p.input_price_vnd is distinct from 0
  ) then raise exception 'order_cost_missing' using errcode='22023'; end if;

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
    v_balance_after := public.taphoa_chat_customer_balance_value(o.customer_account_id);
    perform public.taphoa_chat_notify_customer(
      o.customer_account_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':deliver',
      public.taphoa_chat_order_receipt(
        v_order_json,
        'Chuyển đơn tạm → đã giao', null::bigint)
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$function$;
