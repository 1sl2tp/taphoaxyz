begin;

create or replace function public.taphoa_customer_mini_link(
  p_customer_id uuid,
  p_tab text default 'hang',
  p_source_key text default null,
  p_segment text default null,
  p_order_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link jsonb;
  v_slug text;
  v_tab text := lower(btrim(coalesce(p_tab,'hang')));
  v_source text := lower(btrim(coalesce(p_source_key,'')));
  v_segment text := lower(btrim(coalesce(p_segment,'')));
  v_order text := upper(btrim(coalesce(p_order_code,'')));
  v_url text;
begin
  if p_customer_id is null then return null; end if;
  if v_tab not in ('hang','don','no') then v_tab := 'hang'; end if;
  if v_source<>'' and v_source !~ '^[a-z0-9-]+$' then v_source := ''; end if;
  if v_segment not in ('da-mua','goi-y','tat-ca') then v_segment := ''; end if;
  if v_order<>'' and v_order !~ '^(DG|DT)[0-9]+$' then v_order := ''; end if;

  v_link := public.v21_customer_public_link_info_get_or_create(p_customer_id);
  v_slug := nullif(v_link->>'public_slug','');
  if v_slug is null then return null; end if;

  v_url := 'https://app.taphoa.xyz/kh/?kh=' || v_slug || '&tab=' || v_tab;
  if v_tab='hang' and v_source<>'' then
    v_url := v_url || '&nguon=' || v_source;
  end if;
  if v_tab='hang' and v_segment<>'' and v_segment<>'tat-ca' then
    v_url := v_url || '&muc=' || v_segment;
  end if;
  if v_tab='don' and v_order<>'' then
    v_url := v_url || '&don=' || v_order;
  end if;
  return v_url;
end;
$$;

revoke all on function public.taphoa_customer_mini_link(uuid,text,text,text,text)
  from public,anon,authenticated;

create or replace function public.taphoa_chat_order_receipt(
  p_order_json jsonb,
  p_heading text,
  p_balance_vnd bigint default null::bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
  v_url text;
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
    v_url := public.taphoa_customer_mini_link(v_customer,'don',null,null,v_code);
    if v_url is not null then
      v_body := v_body || E'\nXem đơn: ' || v_url;
    end if;
  end if;

  return v_body;
end;
$$;

create or replace function public.taphoa_chat_notify_customer(
  p_customer_id uuid,
  p_sender_account_id uuid,
  p_client_id text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  v_url text;
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

  if v_client_id like 'taphoa:%:collection' then
    v_amount_text := btrim(regexp_replace(split_part(v_body,E'\n',1),'^Đã thu[[:space:]]+','','i'));
    if v_amount_text='' then v_amount_text := '0'; end if;
    v_balance := public.taphoa_chat_customer_balance_value(p_customer_id);
    v_url := public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);

    v_body := 'Đã thu ' || v_amount_text
      || ' · ' || public.taphoa_chat_balance_label(v_balance,false)
      || E'\n' || public.taphoa_chat_when(now());

    if v_url is not null then
      v_body := v_body || E'\nXem công nợ: ' || v_url;
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
$$;

commit;
