-- Prefer the customer's actively used V21 conversation when TAPHOA emits business notices.
-- Repair business notices emitted after the first integration if a reversed duplicate conversation existed.

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
begin
  if p_customer_id is null or p_sender_account_id is null then
    return null;
  end if;
  if v_client_id='' then raise exception 'chat_client_id_required'; end if;
  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

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

revoke all on function public.taphoa_chat_notify_customer(uuid,uuid,text,text) from public, anon, authenticated;

with auto_messages as (
  select m.id,m.conversation_id,m.sender_account_id,c.member_a,c.member_b
  from public.v21_messages m
  join public.v21_conversations c on c.id=m.conversation_id
  where m.client_id like 'taphoa:%'
    and m.created_at >= '2026-09-22T09:40:00Z'::timestamptz
), targets as (
  select a.id as message_id,(
    select c2.id
    from public.v21_conversations c2
    left join lateral (
      select max(m2.created_at) as latest_at
      from public.v21_messages m2
      where m2.conversation_id=c2.id
        and m2.deleted_at is null
        and m2.client_id not like 'taphoa:%'
    ) activity on true
    where (
      c2.member_a=a.member_a and c2.member_b=a.member_b
    ) or (
      c2.member_a=a.member_b and c2.member_b=a.member_a
    )
    order by activity.latest_at desc nulls last,c2.created_at desc,c2.id
    limit 1
  ) as target_conversation_id
  from auto_messages a
)
update public.v21_messages m
set conversation_id=t.target_conversation_id
from targets t
where m.id=t.message_id
  and t.target_conversation_id is not null
  and m.conversation_id is distinct from t.target_conversation_id;
