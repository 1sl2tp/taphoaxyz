-- SPEC-DEBT-MANUAL-LINKED-20261101: deliberate admin send of the current
-- customer debt to the linked Chat/Zalo contact. No debt/payment/order mutations.
-- Unlinked contacts receive nothing; the browser retains native PNG sharing.
create or replace function public.taphoa_manual_send_customer_debt(
  p_customer_id uuid,p_request_id uuid
) returns jsonb
language plpgsql volatile security definer
set search_path to public,v21_private,auth,pg_temp
as $$
declare
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_customer public.v21_accounts;
  v_client_id text;
  v_message_id uuid;
  v_balance numeric;
  v_url text;
  v_notice text;
begin
  if not coalesce((v_ctx->>'allowed')::boolean,false)
    or v_ctx->>'taphoa_role'<>'admin'
    or v_sender is null or auth.uid() is null
  then raise exception 'taphoa_admin_required' using errcode='42501'; end if;
  if p_customer_id is null or p_request_id is null
  then raise exception 'manual_debt_request_required'; end if;

  select * into v_customer from public.v21_accounts a
  where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
    and a.deleted_at is null and a.locked_at is null;
  if not found then
    return jsonb_build_object('ok',false,'reason','customer_not_found');
  end if;
  if not exists(
    select 1 from public.zalo_user_links z
    where z.chat_account_id=v_customer.id
  ) then
    return jsonb_build_object('ok',false,'reason','zalo_not_linked');
  end if;

  -- Serialize this sender/customer pair across simultaneous browser tabs.
  perform pg_advisory_xact_lock(hashtextextended(
    'manual-debt:'||v_sender::text||':'||p_customer_id::text,0
  ));
  v_client_id:='manual:debt:'||p_request_id::text;
  if exists(
    select 1 from public.v21_messages m
    where m.sender_account_id=v_sender and m.client_id=v_client_id
      and m.deleted_at is null
      and not exists(
        select 1 from public.v21_conversations c
        where c.id=m.conversation_id
          and (c.member_a=p_customer_id or c.member_b=p_customer_id)
      )
  ) then
    raise exception 'manual_debt_request_conflict' using errcode='42501';
  end if;
  select m.id into v_message_id
  from public.v21_messages m
  join public.v21_conversations c on c.id=m.conversation_id
  where m.sender_account_id=v_sender and m.client_id=v_client_id
    and m.deleted_at is null
    and (c.member_a=p_customer_id or c.member_b=p_customer_id)
  limit 1;
  if v_message_id is not null then
    return jsonb_build_object('ok',true,'already_sent',true,
      'message_id',v_message_id,'customer_id',p_customer_id);
  end if;
  if exists(
    select 1 from public.v21_messages m
    join public.v21_conversations c on c.id=m.conversation_id
    where m.sender_account_id=v_sender and m.deleted_at is null
      and m.client_id like 'manual:debt:%'
      and (c.member_a=p_customer_id or c.member_b=p_customer_id)
      and m.created_at>now()-interval '20 seconds'
  ) then
    return jsonb_build_object('ok',false,'reason','recently_sent');
  end if;

  -- The actual balance is read on the server; never trust the UI total.
  v_balance:=public.taphoa_chat_customer_balance_value(p_customer_id);
  v_notice:='🧾 Công nợ hiện tại'||E'\n'||
    public.taphoa_chat_balance_label(v_balance,false);
  v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
  if coalesce(v_url,'')<>'' then
    v_notice:=v_notice||E'\nXem chi tiết công nợ: '||v_url;
  end if;
  v_message_id:=public.taphoa_chat_notify_customer(
    p_customer_id,v_sender,v_client_id,v_notice
  );
  if v_message_id is null then raise exception 'manual_debt_chat_send_failed'; end if;
  return jsonb_build_object('ok',true,'already_sent',false,
    'message_id',v_message_id,'customer_id',p_customer_id);
end;
$$;
revoke all on function public.taphoa_manual_send_customer_debt(uuid,uuid)
  from public,anon;
grant execute on function public.taphoa_manual_send_customer_debt(uuid,uuid)
  to authenticated;
