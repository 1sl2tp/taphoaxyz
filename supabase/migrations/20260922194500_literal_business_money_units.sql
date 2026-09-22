-- Canonical TAPHOA money model: preserve literal business values from the management sheet.
-- A dot is only a thousands separator in presentation; no implicit x1000 or /1000.

alter table public.taphoa_products
  alter column input_price_vnd type numeric using input_price_vnd::numeric/1000,
  alter column applied_profit_vnd type numeric using applied_profit_vnd::numeric/1000,
  alter column sale_price_vnd type numeric using sale_price_vnd::numeric/1000,
  alter column carton_price_vnd type numeric using carton_price_vnd::numeric/1000,
  alter column retail_price_vnd type numeric using retail_price_vnd::numeric/1000;

alter table public.taphoa_order_items
  alter column unit_price_vnd type numeric using unit_price_vnd::numeric/1000,
  alter column unit_cost_vnd_snapshot type numeric using unit_cost_vnd_snapshot::numeric/1000;

alter table public.taphoa_debt_ledger
  alter column amount_vnd type numeric using amount_vnd::numeric/1000;

alter table public.taphoa_product_create_requests
  alter column input_price_vnd type numeric using input_price_vnd::numeric/1000,
  alter column sale_price_vnd type numeric using sale_price_vnd::numeric/1000;

create or replace function public.taphoa_chat_customer_balance_value(p_customer_id uuid)
returns numeric
language sql
stable
set search_path=public
as $$
  select coalesce(sum(l.amount_vnd),0)
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id;
$$;

create or replace function public.taphoa_chat_money(p_amount_vnd numeric)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare
  v_abs numeric := abs(coalesce(p_amount_vnd,0));
  v_int numeric;
  v_int_text text;
  v_frac text;
begin
  v_int := trunc(v_abs);
  v_int_text := replace(to_char(v_int,'FM999,999,999,999,990'),',','.');
  if v_abs=v_int then return v_int_text; end if;
  v_frac := regexp_replace(to_char(v_abs-v_int,'FM0.999'),'0+$','');
  v_frac := ltrim(v_frac,'0.');
  return v_int_text || ',' || v_frac;
end;
$$;

create or replace function public.taphoa_chat_balance_label(p_balance_vnd numeric,p_before boolean default false)
returns text
language plpgsql
immutable
set search_path=public
as $$
begin
  if coalesce(p_balance_vnd,0)>0 then
    return (case when p_before then 'Nợ trước: ' else 'Còn nợ: ' end)||public.taphoa_chat_money(p_balance_vnd);
  elsif coalesce(p_balance_vnd,0)<0 then
    return (case when p_before then 'Dư trước: ' else 'Còn dư: ' end)||public.taphoa_chat_money(p_balance_vnd);
  end if;
  return case when p_before then 'Trước giao dịch: 0' else 'Đã hết nợ: 0' end;
end;
$$;

create or replace function public.taphoa_product_row_hash(p_code text,p_name text,p_input_price_vnd numeric,p_sale_price_vnd numeric)
returns text
language sql
immutable
set search_path=public
as $$
  select encode(
    extensions.digest(
      upper(btrim(coalesce(p_code,''))) || '|' ||
      btrim(coalesce(p_name,'')) || '|' ||
      coalesce(p_input_price_vnd::text,'') || '|' ||
      coalesce(p_sale_price_vnd::text,''),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.taphoa_apply_product_delta(p_products jsonb, p_source_codes jsonb, p_modified_time timestamp with time zone, p_total_rows integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_upserted integer:=0; v_deactivated integer:=0; v_revision bigint:=0;
begin
  if jsonb_typeof(p_products)<>'array' then raise exception 'taphoa_products_delta_invalid'; end if;
  if jsonb_typeof(p_source_codes)<>'array' then raise exception 'taphoa_source_codes_invalid'; end if;
  if jsonb_array_length(p_products)>0 then
    insert into public.taphoa_products(product_code,source_key,source_row,product_name,input_price_vnd,input_price_basis,expected_profit_percent,
      applied_profit_vnd,sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,sheet_updated_at,sync_status,deleted_at,updated_at)
    select x.product_code,x.source_key,x.source_row,x.product_name,x.input_price_vnd,x.input_price_basis,x.expected_profit_percent,coalesce(x.applied_profit_vnd,0),
      x.sale_price_vnd,x.carton_price_vnd,x.retail_price_vnd,x.units_per_carton,coalesce(x.retail_unit,''),x.stock_status,coalesce(x.stock_label,''),true,
      coalesce(x.raw_row,'[]'::jsonb),coalesce(x.sheet_updated_at,p_modified_time),'active',null,now()
    from jsonb_to_recordset(p_products) as x(product_code text,source_key text,source_row integer,product_name text,input_price_vnd numeric,
      input_price_basis text,expected_profit_percent numeric,applied_profit_vnd numeric,sale_price_vnd numeric,carton_price_vnd numeric,retail_price_vnd numeric,
      units_per_carton numeric,retail_unit text,stock_status text,stock_label text,is_active boolean,raw_row jsonb,sheet_updated_at timestamptz)
    on conflict(product_code) do update set source_key=excluded.source_key,source_row=excluded.source_row,product_name=excluded.product_name,
      input_price_vnd=excluded.input_price_vnd,input_price_basis=excluded.input_price_basis,expected_profit_percent=excluded.expected_profit_percent,
      applied_profit_vnd=excluded.applied_profit_vnd,sale_price_vnd=excluded.sale_price_vnd,carton_price_vnd=excluded.carton_price_vnd,
      retail_price_vnd=excluded.retail_price_vnd,units_per_carton=excluded.units_per_carton,retail_unit=excluded.retail_unit,
      stock_status=excluded.stock_status,stock_label=excluded.stock_label,is_active=true,raw_row=excluded.raw_row,sheet_updated_at=excluded.sheet_updated_at,
      sync_status='active',deleted_at=null,updated_at=now()
    where taphoa_products.sync_status <> 'pending_delete';
    get diagnostics v_upserted=row_count;
  end if;

  update public.taphoa_products p set is_active=false,sync_status='deleted',deleted_at=coalesce(p.deleted_at,now()),stock_status='no_price',stock_label='Ngừng dùng',
    sheet_updated_at=p_modified_time,updated_at=now()
  where p.sync_status<>'pending_delete' and p.is_active=true and exists(
    select 1 from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
    where s.source_key=p.source_key and not exists(select 1 from jsonb_array_elements_text(s.codes) c(code) where c.code=p.product_code)
  );
  get diagnostics v_deactivated=row_count;

  delete from public.taphoa_product_sheet_state st where exists(
    select 1 from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
    where s.source_key=st.source_key and not exists(select 1 from jsonb_array_elements_text(s.codes) c(code) where c.code=st.product_code)
  );

  if v_upserted+v_deactivated>0 then update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products' returning revision into v_revision;
  else select revision into v_revision from public.taphoa_revisions where domain='products'; end if;
  update public.taphoa_sheet_sync_state set last_drive_modified_time=p_modified_time,last_success_at=now(),last_sync_status='success',last_error='',
    last_imported_row_count=greatest(coalesce(p_total_rows,0),0),updated_at=now() where id=1;
  return jsonb_build_object('upserted',v_upserted,'deactivated',v_deactivated,'revision',v_revision);
end; $function$;

CREATE OR REPLACE FUNCTION public.taphoa_apply_product_sync(p_sources jsonb, p_products jsonb, p_modified_time timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imported integer := 0;
  v_deactivated integer := 0;
  v_revision bigint := 0;
begin
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) <> 5 then
    raise exception 'taphoa_sources_snapshot_invalid';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'taphoa_products_snapshot_empty';
  end if;

  insert into public.taphoa_sources(source_key,name,sort_order,active,updated_at)
  select x.source_key,x.name,x.sort_order,coalesce(x.active,true),now()
  from jsonb_to_recordset(p_sources) as x(
    source_key text,
    name text,
    sort_order integer,
    active boolean
  )
  on conflict (source_key) do update
  set name=excluded.name,
      sort_order=excluded.sort_order,
      active=excluded.active,
      updated_at=excluded.updated_at;

  insert into public.taphoa_products(
    product_code,source_key,source_row,product_name,
    input_price_vnd,input_price_basis,expected_profit_percent,applied_profit_vnd,
    sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit,
    stock_status,stock_label,is_active,raw_row,sheet_updated_at,updated_at
  )
  select
    x.product_code,x.source_key,x.source_row,x.product_name,
    x.input_price_vnd,x.input_price_basis,x.expected_profit_percent,coalesce(x.applied_profit_vnd,0),
    x.sale_price_vnd,x.carton_price_vnd,x.retail_price_vnd,x.units_per_carton,coalesce(x.retail_unit,''),
    x.stock_status,coalesce(x.stock_label,''),coalesce(x.is_active,true),coalesce(x.raw_row,'[]'::jsonb),
    coalesce(x.sheet_updated_at,p_modified_time),now()
  from jsonb_to_recordset(p_products) as x(
    product_code text,
    source_key text,
    source_row integer,
    product_name text,
    input_price_vnd numeric,
    input_price_basis text,
    expected_profit_percent numeric,
    applied_profit_vnd numeric,
    sale_price_vnd numeric,
    carton_price_vnd numeric,
    retail_price_vnd numeric,
    units_per_carton numeric,
    retail_unit text,
    stock_status text,
    stock_label text,
    is_active boolean,
    raw_row jsonb,
    sheet_updated_at timestamptz
  )
  on conflict (product_code) do update
  set source_key=excluded.source_key,
      source_row=excluded.source_row,
      product_name=excluded.product_name,
      input_price_vnd=excluded.input_price_vnd,
      input_price_basis=excluded.input_price_basis,
      expected_profit_percent=excluded.expected_profit_percent,
      applied_profit_vnd=excluded.applied_profit_vnd,
      sale_price_vnd=excluded.sale_price_vnd,
      carton_price_vnd=excluded.carton_price_vnd,
      retail_price_vnd=excluded.retail_price_vnd,
      units_per_carton=excluded.units_per_carton,
      retail_unit=excluded.retail_unit,
      stock_status=excluded.stock_status,
      stock_label=excluded.stock_label,
      is_active=excluded.is_active,
      raw_row=excluded.raw_row,
      sheet_updated_at=excluded.sheet_updated_at,
      updated_at=excluded.updated_at;

  get diagnostics v_imported = row_count;

  update public.taphoa_products p
  set is_active=false,
      stock_status='no_price',
      stock_label='Ngừng dùng',
      sheet_updated_at=p_modified_time,
      updated_at=now()
  where p.source_key in (
    select s.source_key
    from jsonb_to_recordset(p_sources) as s(source_key text,name text,sort_order integer,active boolean)
  )
    and not exists (
      select 1
      from jsonb_to_recordset(p_products) as i(product_code text)
      where i.product_code=p.product_code
    )
    and p.is_active=true;

  get diagnostics v_deactivated = row_count;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products'
  returning revision into v_revision;

  update public.taphoa_sheet_sync_state
  set last_drive_modified_time=p_modified_time,
      last_success_at=now(),
      last_sync_status='success',
      last_error='',
      last_imported_row_count=v_imported,
      updated_at=now()
  where id=1;

  return jsonb_build_object(
    'imported',v_imported,
    'deactivated',v_deactivated,
    'revision',v_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_customer_balance_vnd(p_customer_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select round(coalesce(sum(l.amount_vnd),0))::bigint
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_money(p_amount_vnd bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select replace(
    to_char(abs(coalesce(p_amount_vnd,0)),'FM999,999,999,999,990'),
    ',',
    '.'
  );
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_balance_label(p_balance_vnd bigint, p_before boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(p_balance_vnd,0)>0 then
    return (case when p_before then 'Nợ trước: ' else 'Còn nợ: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  elsif coalesce(p_balance_vnd,0)<0 then
    return (case when p_before then 'Dư trước: ' else 'Còn dư: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  end if;
  return case when p_before then 'Trước giao dịch: 0' else 'Đã hết nợ: 0' end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_notify_customer(p_customer_id uuid, p_sender_account_id uuid, p_client_id text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_client_id text := left(btrim(coalesce(p_client_id,'')),120);
  v_body text := btrim(coalesce(p_body,''));
  v_display_code text;
  v_prefix text;
  v_no bigint;
  v_order public.taphoa_orders;
  v_order_json jsonb;
  v_amount_text text;
  v_balance numeric;
  v_link jsonb;
  v_slug text;
begin
  if p_customer_id is null or p_sender_account_id is null then
    return null;
  end if;
  if v_client_id='' then raise exception 'chat_client_id_required'; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_sender_account_id
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_sender_not_admin' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id
      and a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_customer_not_found';
  end if;

  -- Existing save-order code may still build a verbose edit body. Collapse it
  -- here so every device receives the same compact customer-facing format.
  if v_client_id like 'taphoa:%:order'
     and lower(v_body) like '%đã được sửa%' then
    if v_body like '%Không có thay đổi nội dung.%' then
      return null;
    end if;

    v_display_code := upper(substring(v_body from '((DG|DT)[0-9]+)'));
    if v_display_code is not null then
      v_prefix := substring(v_display_code from '^([A-Z]+)');
      v_no := nullif(substring(v_display_code from '([0-9]+)$'),'')::bigint;

      select *
      into v_order
      from public.taphoa_orders o
      where o.customer_account_id=p_customer_id
        and o.display_prefix=v_prefix
        and o.display_no=v_no
      order by o.updated_at desc
      limit 1;

      if found then
        v_order_json := public.taphoa_order_frontend_json(v_order);
        v_body := public.taphoa_chat_order_receipt(v_order_json,'Cập nhật',null);
      end if;
    end if;
  end if;

  -- Collection messages keep only movement + resulting balance + time + link.
  if v_client_id like 'taphoa:%:collection' then
    v_amount_text := btrim(regexp_replace(split_part(v_body,E'\n',1),'^Đã thu[[:space:]]+','','i'));
    if v_amount_text='' then v_amount_text := '0'; end if;
    v_balance := public.taphoa_chat_customer_balance_value(p_customer_id);
    v_link := public.v21_customer_public_link_info_get_or_create(p_customer_id);
    v_slug := nullif(v_link->>'public_slug','');

    v_body := 'Đã thu ' || v_amount_text
      || ' · ' || public.taphoa_chat_balance_label(v_balance,false)
      || E'\n' || public.taphoa_chat_when(now());

    if v_slug is not null then
      v_body := v_body || E'\nXem công nợ: https://app.taphoa.xyz/no/?kh=' || v_slug;
    end if;
  end if;

  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

  select c.id
  into v_conversation_id
  from public.v21_conversations c
  left join lateral (
    select max(m.created_at) as latest_at
    from public.v21_messages m
    where m.conversation_id=c.id
      and m.deleted_at is null
      and m.client_id not like 'taphoa:%'
  ) activity on true
  where (
    c.member_a=p_sender_account_id and c.member_b=p_customer_id
  ) or (
    c.member_a=p_customer_id and c.member_b=p_sender_account_id
  )
  order by activity.latest_at desc nulls last,c.created_at desc,c.id
  limit 1;

  if v_conversation_id is null then
    if p_sender_account_id::text < p_customer_id::text then
      v_member_a := p_sender_account_id;
      v_member_b := p_customer_id;
    else
      v_member_a := p_customer_id;
      v_member_b := p_sender_account_id;
    end if;

    insert into public.v21_conversations(member_a,member_b)
    values(v_member_a,v_member_b)
    on conflict(member_a,member_b)
    do update set member_a=excluded.member_a
    returning id into v_conversation_id;
  end if;

  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
  values(v_conversation_id,p_sender_account_id,v_client_id,v_body)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id
    from public.v21_messages m
    where m.sender_account_id=p_sender_account_id
      and m.client_id=v_client_id
    limit 1;
  end if;

  return v_message_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_order_diff(p_old jsonb, p_new jsonb, p_limit integer DEFAULT 6)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
          || case when coalesce(new_price,0)>0 then ' · ' || public.taphoa_chat_money(new_price) else '' end
        when new_qty is null then name || ': ×' || public.taphoa_chat_qty(old_qty) || ' → bỏ'
        else name || ': '
          || concat_ws(' · ',
            case when old_qty is distinct from new_qty
                 then 'SL ' || public.taphoa_chat_qty(old_qty) || ' → ' || public.taphoa_chat_qty(new_qty) end,
            case when old_price is distinct from new_price
                 then 'Giá ' || public.taphoa_chat_money(old_price)
                   || ' → ' || public.taphoa_chat_money(new_price) end
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
$function$;

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
  v_lines text := public.taphoa_chat_order_lines(p_order_json,2);
  v_code text := coalesce(nullif(p_order_json->>'displayCode',''),nullif(p_order_json->>'display_code',''),nullif(p_order_json->>'maDon',''),'--');
  v_customer uuid := nullif(p_order_json->>'customer_id','')::uuid;
  v_order_id uuid := nullif(coalesce(p_order_json->>'order_id',p_order_json->>'id'),'')::uuid;
  v_at timestamptz := coalesce(
    nullif(p_order_json->>'delivered_at','')::timestamptz,
    nullif(p_order_json->>'created_at','')::timestamptz,
    nullif(p_order_json->>'ngay','')::timestamptz,
    now()
  );
  v_kind text;
  v_link jsonb;
  v_slug text;
  v_body text;
begin
  v_kind := case
    when lower(btrim(coalesce(p_heading,''))) like '%sửa%'
      or lower(btrim(coalesce(p_heading,''))) like '%cập nhật%' then 'Cập nhật'
    when lower(btrim(coalesce(p_heading,''))) like '%giao%' then 'Đã giao'
    when lower(btrim(coalesce(p_heading,''))) like '%tạo%' then 'Tạo đơn'
    else coalesce(nullif(btrim(p_heading),''),'Đơn hàng')
  end;

  v_body := v_kind || ' · ' || v_code
    || ' · ' || v_codes || ' mã'
    || ' · ' || v_qty || ' sản phẩm'
    || ' · ' || public.taphoa_chat_money(v_total_vnd);

  if btrim(coalesce(v_lines,''))<>'' then
    v_body := v_body || E'\n' || v_lines;
  end if;

  v_body := v_body || E'\n' || public.taphoa_chat_when(v_at);

  if v_customer is not null and v_order_id is not null and v_code<>'--' then
    v_link := public.v21_customer_public_link_info_get_or_create(v_customer);
    v_slug := nullif(v_link->>'public_slug','');
    if v_slug is not null then
      v_body := v_body || E'\nXem đơn: https://app.taphoa.xyz/d/?kh='
        || v_slug || '&don=' || v_code;
    end if;
  end if;

  return v_body;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_debt_ledger_page(p_customer_id uuid, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  customer_row public.v21_accounts;
  limit_rows integer := greatest(1,least(100,coalesce(p_limit,50)));
  current_balance numeric;
  transactions jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if ctx->>'taphoa_role'<>'admin' and p_customer_id<>nullif(ctx->>'account_id','')::uuid then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found' using errcode='P0002'; end if;

  select coalesce(sum(amount_vnd),0) into current_balance
  from public.taphoa_debt_ledger
  where customer_account_id=p_customer_id;

  with running as (
    select l.*,
      sum(l.amount_vnd) over(order by l.created_at,l.id rows between unbounded preceding and current row) as balance_after
    from public.taphoa_debt_ledger l
    where l.customer_account_id=p_customer_id
  ), page as (
    select * from running
    where p_before_at is null
       or (created_at,id) < (p_before_at,coalesce(p_before_id,9223372036854775807::bigint))
    order by created_at desc,id desc
    limit limit_rows
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,
      'maDon',case when order_id is null then '' else order_id::text end,
      'order_id',case when order_id is null then '' else order_id::text end,
      'entryType',entry_type,
      'soTien',abs(amount_vnd),
      'amount',abs(amount_vnd),
      'bienDong',amount_vnd,
      'movement',amount_vnd,
      'balanceAfter',balance_after,
      'balance_after',balance_after,
      'ghiChu',note,
      'note',note,
      'ngay',created_at,
      'occurred_at',created_at
    ) order by created_at desc,id desc
  ),'[]'::jsonb) into transactions
  from page;

  return jsonb_build_object(
    'customer',jsonb_build_object(
      'id',customer_row.id::text,
      'maKH',customer_row.id::text,
      'ten',customer_row.display_name,
      'name',customer_row.display_name,
      'username',customer_row.username
    ),
    'soDu',current_balance,
    'balance',current_balance,
    'transactions',transactions
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_debt_summary_frontend_json(p_ctx jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id::text,
      'maKH',a.id::text,
      'ten',a.display_name,
      'name',a.display_name,
      'username',a.username,
      'soDu',coalesce(d.balance_vnd,0),
      'balance',coalesce(d.balance_vnd,0),
      'transactionCount',coalesce(d.tx_count,0),
      'count',coalesce(d.tx_count,0),
      'lastTransaction',d.last_at,
      'last',d.last_at
    ) order by abs(coalesce(d.balance_vnd,0)) desc,a.display_name
  ),'[]'::jsonb)
  from public.v21_accounts a
  left join lateral (
    select coalesce(sum(l.amount_vnd),0) as balance_vnd,
           count(*)::integer as tx_count,
           max(l.created_at) as last_at
    from public.taphoa_debt_ledger l
    where l.customer_account_id=a.id
  ) d on true
  where a.role = 'user'
    and a.contact_group = 'customer'
    and a.deleted_at is null
    and a.locked_at is null
    and (
      p_ctx->>'taphoa_role'='admin'
      or a.id=nullif(p_ctx->>'account_id','')::uuid
    );
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_debt_transaction(p_customer_id uuid, p_type text, p_amount numeric, p_note text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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

  if coalesce(p_amount,0)<=0 then
    raise exception 'amount_must_be_positive';
  end if;

  -- Manual debt input is whole business numbers. A stale client that parses
  -- "1.704" as decimal 1.704 is rejected instead of corrupting the ledger.
  if p_amount<>trunc(p_amount) then
    raise exception 'amount_must_be_whole_number';
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

  v_balance_before := public.taphoa_chat_customer_balance_value(p_customer_id);

  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
  values(p_customer_id,v_entry_type,v_signed,coalesce(p_note,''),(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('debt');

  v_balance_after := public.taphoa_chat_customer_balance_value(p_customer_id);
  v_result := jsonb_build_object('ok',true,'customer_id',p_customer_id::text,'movement',v_signed);

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

  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'debt_transaction',v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_deliver_order(p_order_id uuid, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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
        'Đơn ' || v_display_code || ' đã giao', null::bigint)
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_order_frontend_json(o taphoa_orders)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          'gia',oi.unit_price_vnd,
          'unit_price',oi.unit_price_vnd,
          'von',oi.unit_cost_vnd_snapshot,
          'unit_cost',oi.unit_cost_vnd_snapshot,
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
      coalesce(sum(oi.qty * oi.unit_cost_vnd_snapshot),0) as cost_vnd
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
    'tongTien',l.total_vnd,
    'tongVon',l.cost_vnd,
    'loiNhuan',(l.total_vnd-l.cost_vnd),
    'items',l.items
  )
  from lines l
  cross join code
  left join public.v21_accounts c on c.id=o.customer_account_id;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_products_frontend_json()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.product_code,
      'maSP',p.product_code,
      'product_code',p.product_code,
      'ten',p.product_name,
      'product_name',p.product_name,
      'gia',coalesce(p.sale_price_vnd,0),
      'von',case when p.input_price_vnd is null then null else p.input_price_vnd end,
      'nhom',p.source_key,
      'product_group',p.source_key,
      'donVi',case when p.input_price_basis='retail' then coalesce(nullif(p.retail_unit,''),'lẻ') else 'thùng' end,
      'donViLe',p.retail_unit,
      'quyCach',p.units_per_carton,
      'quyDoiThung',p.units_per_carton,
      'giaLe',case when p.retail_price_vnd is null then null else p.retail_price_vnd end,
      'imageUrl',coalesce(m.image_url,''),
      'image_url',coalesce(m.image_url,''),
      'imageSourceUrl',coalesce(m.image_source_url,''),
      'marketSource',coalesce(m.market_source,''),
      'marketProductName',coalesce(m.market_product_name,''),
      'marketPackKind',coalesce(m.market_pack_kind,''),
      'marketPackaging',coalesce(m.market_packaging,''),
      'marketCartonPriceVnd',m.market_carton_price_vnd,
      'marketRetailPriceVnd',m.market_retail_price_vnd,
      'marketSourcePriceVnd',m.market_source_price_vnd,
      'marketUnitsPerCarton',m.market_units_per_carton,
      'marketPackLabel2',coalesce(m.market_pack_label2,''),
      'marketPackQty2',m.market_pack_qty2,
      'marketPackLabel3',coalesce(m.market_pack_label3,''),
      'marketPackQty3',m.market_pack_qty3,
      'marketSelectedPriceVnd',m.market_selected_price_vnd,
      'marketCompareKind',coalesce(m.market_compare_kind,''),
      'marketCompareUnitsPerCarton',m.market_compare_units_per_carton,
      'ownCompareUnitsPerCarton',m.own_compare_units_per_carton,
      'active',p.is_active,
      'stockStatus',p.stock_status,
      'stockLabel',p.stock_label
    ) order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  left join public.taphoa_product_media m on m.product_code=p.product_code
  where p.is_active and s.active;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_product_row_hash(p_code text, p_name text, p_input_price_vnd bigint, p_sale_price_vnd bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select encode(
    extensions.digest(
      upper(btrim(coalesce(p_code,''))) || '|' ||
      btrim(coalesce(p_name,'')) || '|' ||
      coalesce(p_input_price_vnd::text,'') || '|' ||
      coalesce(p_sale_price_vnd::text,''),
      'sha256'
    ),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_reverse_order(p_order_id uuid, p_reason text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  o public.taphoa_orders;
  v_total numeric;
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
  if o.status<>'delivered' then raise exception 'order_not_delivered'; end if;

  select coalesce(sum(qty*unit_price_vnd),0) into v_total
  from public.taphoa_order_items where order_id=o.id;
  update public.taphoa_orders set status='reversed',reversed_at=now(),updated_at=now()
  where id=o.id returning * into o;
  insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
  values(o.customer_account_id,o.id,'reversal',-v_total,coalesce(nullif(btrim(p_reason),''),'Hoàn đơn'),(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('orders');
  perform public.taphoa_bump_revision('debt');

  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(o));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'reverse_order',v_result);
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

  if v_role='admin' and v_customer is not null then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã giao', null::bigint);
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
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_update_product_from_web(p_product jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  current_row public.taphoa_products;
  pending_row public.taphoa_product_create_requests;
  v_requested_code text := upper(btrim(coalesce(p_product->>'product_code',p_product->>'maSP','')));
  v_name text;
  v_source_key text;
  v_input numeric;
  v_sale numeric;
  v_hash text;
  v_request_id uuid;
  v_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_requested_code='' then raise exception 'product_code_required'; end if;

  if v_requested_code ~ '^SP[0-9]+$' or v_requested_code ~ '^TMP-[0-9A-F-]+$' then
    if v_requested_code ~ '^TMP-[0-9A-F-]+$' then
      begin v_request_id := substring(v_requested_code from 5)::uuid;
      exception when others then raise exception 'pending_product_not_found' using errcode='P0002'; end;
      select * into pending_row from public.taphoa_product_create_requests where request_id=v_request_id for update;
    else
      select * into pending_row
      from public.taphoa_product_create_requests
      where upper(client_code)=v_requested_code and status in ('pending_sheet','sheet_written')
      order by created_at desc limit 1 for update;
    end if;

    v_name := btrim(coalesce(p_product->>'name',case when found then pending_row.product_name else '' end));
    if v_name='' then raise exception 'product_name_required'; end if;
    v_source_key := btrim(coalesce(p_product->>'source_key',case when found then pending_row.source_key else '' end));
    if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and sync_status in ('active','pending_create')) then
      raise exception 'source_not_found' using errcode='P0002';
    end if;
    v_input := case when p_product ? 'cost' then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else (p_product->>'cost')::numeric end else case when found then pending_row.input_price_vnd else null end end;
    v_sale := case when p_product ? 'price' then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else (p_product->>'price')::numeric end else case when found then pending_row.sale_price_vnd else null end end;
    if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
    if v_sale is not null and v_sale<0 then raise exception 'invalid_price'; end if;

    if found then
      update public.taphoa_product_create_requests
      set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,
          status=case when status='error' then 'pending_sheet' else status end,last_error='',updated_at=now()
      where request_id=pending_row.request_id returning * into pending_row;
    else
      insert into public.taphoa_product_create_requests(client_code,source_key,product_name,input_price_vnd,sale_price_vnd)
      values(v_requested_code,v_source_key,v_name,v_input,v_sale) returning * into pending_row;
    end if;

    update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
    return jsonb_build_object('ok',true,'created',true,'pending',true,'request_id',pending_row.request_id,
      'product_code','TMP-'||pending_row.request_id::text,'source_key',pending_row.source_key);
  end if;

  select * into current_row from public.taphoa_products where product_code=v_requested_code for update;
  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;
  if current_row.sync_status='pending_delete' then raise exception 'product_pending_delete'; end if;

  v_name := case when p_product ? 'name' then btrim(coalesce(p_product->>'name','')) else current_row.product_name end;
  if v_name='' then raise exception 'product_name_required'; end if;
  v_source_key := case when p_product ? 'source_key' then btrim(coalesce(p_product->>'source_key','')) else current_row.source_key end;
  if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and sync_status in ('active','pending_create')) then
    raise exception 'source_not_found' using errcode='P0002';
  end if;
  v_input := case when p_product ? 'cost' then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else (p_product->>'cost')::numeric end else current_row.input_price_vnd end;
  v_sale := case when p_product ? 'price' then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else (p_product->>'price')::numeric end else current_row.sale_price_vnd end;
  if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale<0 then raise exception 'invalid_price'; end if;

  v_changed := current_row.product_name is distinct from v_name
    or current_row.source_key is distinct from v_source_key
    or current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale
    or current_row.is_active is distinct from true;
  if not v_changed then return jsonb_build_object('ok',true,'created',false,'changed',false,'product_code',v_requested_code); end if;

  update public.taphoa_products
  set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,carton_price_vnd=v_sale,
      retail_price_vnd=null,applied_profit_vnd=case when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0) else 0 end,
      stock_status=case when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      is_active=true,sync_status='active',deleted_at=null,updated_at=now()
  where product_code=v_requested_code;

  v_hash := public.taphoa_product_row_hash(v_requested_code,v_name,v_input,v_sale);
  update public.taphoa_product_outbox set status='superseded',updated_at=now() where product_code=v_requested_code and status='pending';
  insert into public.taphoa_product_outbox(product_code,source_key,operation,payload,row_hash)
  values(v_requested_code,v_source_key,'upsert',jsonb_build_object('product_code',v_requested_code,'product_name',v_name,
    'input_price_vnd',v_input,'sale_price_vnd',v_sale,'source_row',current_row.source_row,'old_source_key',current_row.source_key),v_hash);
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'created',false,'changed',true,'product_code',v_requested_code,'row_hash',v_hash);
end;
$function$;

revoke all on function public.taphoa_chat_customer_balance_value(uuid) from public,anon,authenticated;
