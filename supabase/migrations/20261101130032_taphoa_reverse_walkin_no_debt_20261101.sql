-- SPEC-WALKIN-REVERSE-NO-DEBT-20261101
-- Given a delivered walk-in order, when an Admin reverses it, then the
-- order becomes reversed without creating a customer debt-ledger entry.
-- Named customer reversals, auth, command idempotency, and notifications unchanged.
-- Rollback: restore preceding taphoa_reverse_order definition from migration history.
CREATE OR REPLACE FUNCTION public.taphoa_reverse_order(p_order_id uuid, p_reason text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  -- SPEC-WALKIN-REVERSE-NO-DEBT-20261101: a walk-in order has no
  -- customer ledger. Do not post a reversal against a null customer.
  if o.customer_account_id is not null then
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(o.customer_account_id,o.id,'reversal',-v_total,coalesce(nullif(btrim(p_reason),''),'Hoàn đơn'),(ctx->>'account_id')::uuid);
    perform public.taphoa_bump_revision('debt');
  end if;
  perform public.taphoa_bump_revision('orders');

  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(o));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'reverse_order',v_result);
  return v_result;
end;
$$;
