create or replace function public.taphoa_stock_check_notify_admin(p_session_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.taphoa_stock_check_sessions;
  v_customer public.v21_accounts;
  v_admin uuid;
  v_conversation uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_message_id uuid;
  v_body text;
  v_lines text;
  v_total_codes int := 0;
  v_total_qty numeric := 0;
  v_total_money numeric := 0;
  v_client_id text;
begin
  select * into v_session
  from public.taphoa_stock_check_sessions
  where id=p_session_id;
  if not found then return null; end if;

  select * into v_customer
  from public.v21_accounts
  where id=v_session.customer_account_id;

  select l.created_by_account_id into v_admin
  from public.taphoa_stock_check_links l
  where l.customer_account_id=v_session.customer_account_id
    and l.created_by_account_id is not null
  order by l.updated_at desc
  limit 1;

  if v_admin is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_admin and a.role='admin'
      and a.deleted_at is null and a.locked_at is null
  ) then
    select a.id into v_admin
    from public.v21_accounts a
    where a.role='admin' and a.deleted_at is null and a.locked_at is null
    order by a.created_at
    limit 1;
  end if;
  if v_admin is null then return null; end if;

  with q as (
    select
      case when p_kind='owner'
        then coalesce(i.owner_qty,i.employee_qty,0)
        else coalesce(i.employee_qty,0)
      end as qty,
      p.source_key,
      case
        when p.source_key='hang-thuong' then 'Hàng thường'
        when p.source_key='hang-u' then 'Hàng U'
        when p.source_key='sua' then 'Sữa'
        when p.source_key='thuoc-la' then 'Thuốc lá'
        when p.source_key='sheet-1150410221' then '#'
        else p.source_key
      end as source_name,
      p.sale_price_vnd
    from public.taphoa_stock_check_items i
    join public.taphoa_products p on p.product_code=i.product_code
    where i.session_id=p_session_id
  ),
  grouped as (
    select source_key,source_name,
           count(*) filter(where qty>0)::int codes,
           coalesce(sum(qty) filter(where qty>0),0)::numeric qty,
           coalesce(sum(qty*sale_price_vnd) filter(where qty>0),0)::numeric money
    from q
    group by source_key,source_name
    having count(*) filter(where qty>0)>0
  )
  select
    coalesce(string_agg(
      source_name||': '||codes||' mã · '||public.taphoa_chat_qty(qty)||' SP'
      ||case when p_kind='owner' then ' · '||public.taphoa_chat_money(money) else '' end,
      E'\n' order by source_name
    ),''),
    coalesce(sum(codes),0)::int,
    coalesce(sum(qty),0)::numeric,
    coalesce(sum(money),0)::numeric
  into v_lines,v_total_codes,v_total_qty,v_total_money
  from grouped;

  if p_kind='owner' then
    v_body := 'Kiểm hàng · '||coalesce(v_customer.display_name,'Khách hàng')
      ||E'\nChủ đã rà soát/cập nhật';
  else
    v_body := 'Kiểm hàng · '||coalesce(v_customer.display_name,'Khách hàng')
      ||E'\nNhân viên vừa gửi · đang chờ chủ rà soát';
  end if;

  if btrim(coalesce(v_lines,''))<>'' then
    v_body := v_body||E'\n'||v_lines;
  end if;

  v_body := v_body||E'\nTổng: '||v_total_codes||' mã · '||public.taphoa_chat_qty(v_total_qty)||' SP';
  if p_kind='owner' then
    v_body := v_body||' · '||public.taphoa_chat_money(v_total_money);
  end if;

  select c.id into v_conversation
  from public.v21_conversations c
  where (c.member_a=v_admin and c.member_b=v_session.customer_account_id)
     or (c.member_b=v_admin and c.member_a=v_session.customer_account_id)
  order by c.created_at desc
  limit 1;

  if v_conversation is null then
    if v_admin::text < v_session.customer_account_id::text then
      v_member_a:=v_admin; v_member_b:=v_session.customer_account_id;
    else
      v_member_a:=v_session.customer_account_id; v_member_b:=v_admin;
    end if;
    insert into public.v21_conversations(member_a,member_b)
    values(v_member_a,v_member_b)
    on conflict(member_a,member_b) do update set member_a=excluded.member_a
    returning id into v_conversation;
  end if;

  v_client_id := 'stockcheck:'||p_session_id::text||':'||p_kind||':'||
    case when p_kind='owner'
      then coalesce(extract(epoch from v_session.owner_reviewed_at)::bigint,0)::text
      else coalesce(extract(epoch from v_session.employee_submitted_at)::bigint,0)::text
    end;

  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
  values(v_conversation,v_session.customer_account_id,left(v_client_id,120),left(v_body,8000))
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

update public.v21_messages
set body = regexp_replace(
  body,
  '([0-9]+ mã · [0-9][0-9.,]* SP) · [0-9][0-9.,]*',
  E'\\1',
  'g'
)
where client_id like 'stockcheck:%:employee:%'
  and body like 'Kiểm hàng · %';
