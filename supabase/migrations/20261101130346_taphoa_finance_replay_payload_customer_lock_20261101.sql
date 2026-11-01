-- SPEC-FINANCE-REPLAY-PAYLOAD-20261101 / SPEC-FINANCE-SAME-CUSTOMER-RECEIPT-20261101
-- A replayed money command must match customer, transaction kind and amount.
-- Concurrent manual Web/PWA receipts for the same customer serialize their
-- balance snapshots; other finance entry points require separate review.
-- Rollback: restore preceding taphoa_debt_transaction function definition.
CREATE OR REPLACE FUNCTION public.taphoa_debt_transaction(p_customer_id uuid, p_type text, p_amount numeric, p_note text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    v_notice := '✅ Đã thu · ' || public.taphoa_chat_money(v_amount_vnd)
      || E'
' || public.taphoa_chat_balance_label(v_balance_before,true)
      || E'
' || public.taphoa_chat_balance_label(v_balance_after,false);

    if btrim(coalesce(p_note,''))<>'' then
      v_notice := v_notice || E'
Ghi chú: ' || left(btrim(p_note),120);
    end if;

    v_url := public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
    if coalesce(v_url,'')<>'' then
      v_notice := v_notice || E'\nXem công nợ: ' || v_url;
    end if;
    v_sent_message := public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':collection',
      v_notice
    );

  elsif v_entry_type='payment' then
    v_url := public.taphoa_customer_mini_link(
      p_customer_id,'no',null,null,null
    );

    v_notice := '🧾 Ghi nợ · ' || public.taphoa_chat_money(v_amount_vnd)
      || E'
' || public.taphoa_chat_balance_label(v_balance_before,true)
      || E'
' || public.taphoa_chat_balance_label(v_balance_after,false)
;

    if btrim(coalesce(p_note,''))<>'' then
      v_notice := v_notice || E'
Ghi chú: ' || left(btrim(p_note),120);
    end if;

    if coalesce(v_url,'')<>'' then
      v_notice := v_notice || E'
Xem công nợ: ' || v_url;
    end if;

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
$$;
