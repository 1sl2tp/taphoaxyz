-- SPEC-CHAT-FINANCE-20261017: Single debt/collection switch; transaction-
-- precise mini receipt PNG on the SAME Chat message. Never creates a sale,
-- changes money, changes customer opt-ins, or starts care jobs.

-- Synchronize both historical finance switches without touching any other setting.
CREATE OR REPLACE FUNCTION v21_private.chat_sync_finance_switch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.send_debt IS DISTINCT FROM OLD.send_debt THEN
    NEW.send_collection := NEW.send_debt;
  ELSIF NEW.send_collection IS DISTINCT FROM OLD.send_collection THEN
    NEW.send_debt := NEW.send_collection;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_sync_finance_switch_trg ON v21_private.chat_outbound_options;
CREATE TRIGGER chat_sync_finance_switch_trg
BEFORE INSERT OR UPDATE OF send_debt,send_collection ON v21_private.chat_outbound_options
FOR EACH ROW EXECUTE FUNCTION v21_private.chat_sync_finance_switch();
UPDATE v21_private.chat_outbound_options
SET send_collection=send_debt WHERE send_collection IS DISTINCT FROM send_debt;

-- Keep all existing debt ledger/command-idempotency/opt-in behavior.
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
    perform public.taphoa_chat_notify_customer(
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

    perform public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':debt',
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'debt_transaction',v_result);

  return v_result;
end;
$$;

-- Text is intentionally short because the image contains full order rows.
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

  -- Only the heading and compact order totals in text.
  -- Detailed products and transaction time remain visible on the attached image.
  v_body := v_kind || ' · ' || v_code || E'\n'
    || v_codes || ' mã · ' || v_qty || ' sản phẩm · '
    || public.taphoa_chat_money(v_total_vnd);

  if v_customer is not null and v_order_id is not null and v_code<>'--' then
    v_url := public.taphoa_customer_mini_link(v_customer,'don',null,null,v_code);
    if v_url is not null then
      v_body := v_body || E'\nXem đơn: ' || v_url;
    end if;
  end if;

  return v_body;
end;
$$;

-- Order image ticket must continue to match the new two-line compact heading.
CREATE OR REPLACE FUNCTION public.taphoa_order_notice_image_ticket(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $$
declare
 v_ctx jsonb := public.taphoa_access_context();
 v_sender uuid := nullif(v_ctx->>'account_id','')::uuid;
 v_order public.taphoa_orders;
 v_code text;
 v_msg public.v21_messages;
 v_ticket v21_private.taphoa_order_notice_image_uploads;
 v_asset_id uuid;
begin
 if not coalesce((v_ctx->>'allowed')::boolean,false) or v_ctx->>'taphoa_role' <> 'admin'
    or v_sender is null or auth.uid() is null then
   raise exception 'taphoa_admin_required' using errcode='42501';
 end if;
 select * into v_order from public.taphoa_orders where id=p_order_id;
 if not found or v_order.customer_account_id is null or v_order.status <> 'delivered' then
   return jsonb_build_object('ok',false,'reason','not_delivered_customer_order');
 end if;
 v_code := v_order.display_prefix||v_order.display_no::text;
 if v_code !~ '^DG[0-9]+$' then
   return jsonb_build_object('ok',false,'reason','invalid_order_code');
 end if;
 select m.* into v_msg
 from public.v21_messages m
 join public.v21_conversations c on c.id=m.conversation_id
 where m.sender_account_id=v_sender
  and m.deleted_at is null
  and (c.member_a=v_order.customer_account_id or c.member_b=v_order.customer_account_id)
  and (m.client_id like 'taphoa:%:order' or m.client_id like 'taphoa:%:order-edit' or m.client_id like 'taphoa:%:deliver')
  and (
    position(' · '||v_code||' · ' in m.body)>0
    or position(' · '||v_code||E'\n' in m.body)>0
  )
  and m.created_at>=greatest(v_order.updated_at-interval '90 seconds',now()-interval '20 minutes')
 order by m.created_at desc,m.id desc
 limit 1;
 if v_msg.id is null
  or not v21_private.chat_outbound_allowed(v_order.customer_account_id,v_msg.client_id)
 then
   return jsonb_build_object('ok',false,'reason','notice_not_enabled_or_not_sent');
 end if;
 if exists(select 1 from public.v21_media_assets a
  where a.message_id=v_msg.id and a.kind='image' and a.deleted_at is null) then
   return jsonb_build_object('ok',false,'reason','image_already_attached');
 end if;
 v_asset_id:=gen_random_uuid();
 insert into v21_private.taphoa_order_notice_image_uploads(
  message_id,order_id,sender_account_id,conversation_id,asset_id,storage_key)
 values(v_msg.id,p_order_id,v_sender,v_msg.conversation_id,v_asset_id,
  v_sender::text||'/'||v_msg.conversation_id::text||'/'||v_asset_id::text)
 on conflict(message_id) do nothing;
 select * into v_ticket from v21_private.taphoa_order_notice_image_uploads
 where message_id=v_msg.id;
 if v_ticket.attached_at is not null or v_ticket.created_at<now()-interval '20 minutes' then
   return jsonb_build_object('ok',false,'reason','image_already_sent_or_expired');
 end if;
 return jsonb_build_object('ok',true,'order_id',v_ticket.order_id,'message_id',v_ticket.message_id,
  'asset_id',v_ticket.asset_id,'storage_key',v_ticket.storage_key);
end;
$$;

CREATE TABLE IF NOT EXISTS v21_private.taphoa_debt_notice_image_uploads(
  message_id uuid PRIMARY KEY REFERENCES public.v21_messages(id) ON DELETE CASCADE,
  command_id uuid NOT NULL UNIQUE,
  customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  sender_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  conversation_id uuid NOT NULL REFERENCES public.v21_conversations(id),
  asset_id uuid NOT NULL UNIQUE,
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_at timestamptz
);
ALTER TABLE v21_private.taphoa_debt_notice_image_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON v21_private.taphoa_debt_notice_image_uploads FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.taphoa_debt_notice_image_ticket(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp AS $$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_command public.taphoa_command_log;
  v_customer uuid;
  v_kind text;
  v_msg public.v21_messages;
  v_ticket v21_private.taphoa_debt_notice_image_uploads;
  v_asset uuid;
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin' OR v_sender IS NULL OR auth.uid() IS NULL
  THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
  IF p_command_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','command_required'); END IF;

  SELECT * INTO v_command FROM public.taphoa_command_log
  WHERE command_id=p_command_id AND operation='debt_transaction';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','transaction_not_found'); END IF;
  v_customer:=nullif(v_command.result->>'customer_id','')::uuid;
  v_kind:=CASE WHEN (v_command.result->>'movement')::numeric<0
    THEN 'collection' ELSE 'debt' END;
  IF v_customer IS NULL OR (v_command.result->>'movement')::numeric=0 THEN
    RETURN jsonb_build_object('ok',false,'reason','not_finance_transaction');
  END IF;
  SELECT m.* INTO v_msg
  FROM public.v21_messages m
  JOIN public.v21_conversations c ON c.id=m.conversation_id
  WHERE m.sender_account_id=v_sender AND m.deleted_at IS NULL
    AND m.client_id=('taphoa:'||p_command_id::text||':'||v_kind)
    AND (c.member_a=v_customer OR c.member_b=v_customer)
    AND m.created_at>=now()-interval '20 minutes'
  ORDER BY m.created_at DESC LIMIT 1;
  IF v_msg.id IS NULL OR NOT v21_private.chat_outbound_allowed(v_customer,v_msg.client_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','notice_not_enabled_or_not_sent');
  END IF;
  IF EXISTS(SELECT 1 FROM public.v21_media_assets a WHERE a.message_id=v_msg.id
    AND a.kind='image' AND a.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'reason','image_already_attached');
  END IF;
  v_asset:=gen_random_uuid();
  INSERT INTO v21_private.taphoa_debt_notice_image_uploads(
    message_id,command_id,customer_account_id,sender_account_id,
    conversation_id,asset_id,storage_key)
  VALUES(v_msg.id,p_command_id,v_customer,v_sender,v_msg.conversation_id,
    v_asset,v_sender::text||'/'||v_msg.conversation_id::text||'/'||v_asset::text)
  ON CONFLICT(message_id) DO NOTHING;
  SELECT * INTO v_ticket FROM v21_private.taphoa_debt_notice_image_uploads
  WHERE message_id=v_msg.id;
  IF v_ticket.attached_at IS NOT NULL OR v_ticket.created_at<now()-interval '20 minutes' THEN
    RETURN jsonb_build_object('ok',false,'reason','image_already_sent_or_expired');
  END IF;
  RETURN jsonb_build_object('ok',true,'asset_id',v_ticket.asset_id,
    'storage_key',v_ticket.storage_key,'message_id',v_ticket.message_id);
END;
$$;
REVOKE ALL ON FUNCTION public.taphoa_debt_notice_image_ticket(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_debt_notice_image_ticket(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION v21_storage_private.can_upload_taphoa_debt_notice(p_object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp AS $$
SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM v21_private.taphoa_debt_notice_image_uploads t
  JOIN public.v21_accounts a ON a.id=t.sender_account_id
  JOIN public.v21_messages m ON m.id=t.message_id
  JOIN public.v21_conversations c ON c.id=t.conversation_id
  WHERE t.storage_key=p_object_name AND t.attached_at IS NULL
    AND t.created_at>=now()-interval '20 minutes'
    AND a.auth_user_id=auth.uid() AND a.role='admin' AND a.deleted_at IS NULL
    AND a.locked_at IS NULL AND m.deleted_at IS NULL
    AND m.sender_account_id=a.id AND m.conversation_id=c.id
    AND (c.member_a=t.customer_account_id OR c.member_b=t.customer_account_id)
    AND v21_private.chat_outbound_allowed(t.customer_account_id,m.client_id)
);
$$;
REVOKE ALL ON FUNCTION v21_storage_private.can_upload_taphoa_debt_notice(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION v21_storage_private.can_upload_taphoa_debt_notice(text) TO authenticated;

DROP POLICY IF EXISTS v21_taphoa_debt_notice_upload ON storage.objects;
CREATE POLICY v21_taphoa_debt_notice_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='v21-media' AND v21_storage_private.can_upload_taphoa_debt_notice(name));

CREATE OR REPLACE FUNCTION public.taphoa_debt_notice_image_attach(
  p_command_id uuid,p_asset_id uuid,p_size_bytes bigint,p_width_px integer,p_height_px integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO public,v21_private,auth,storage,pg_temp AS $$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_ticket v21_private.taphoa_debt_notice_image_uploads;
  v_msg public.v21_messages;
  v_mime text;
  v_size bigint;
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin' OR v_sender IS NULL OR auth.uid() IS NULL
  THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
  IF p_command_id IS NULL OR p_asset_id IS NULL
    OR coalesce(p_size_bytes,0)<1 OR p_size_bytes>15728640
    OR coalesce(p_width_px,0)<1 OR p_width_px>20000
    OR coalesce(p_height_px,0)<1 OR p_height_px>20000
  THEN RAISE EXCEPTION 'image_metadata_invalid'; END IF;
  SELECT * INTO v_ticket FROM v21_private.taphoa_debt_notice_image_uploads
  WHERE asset_id=p_asset_id AND command_id=p_command_id AND sender_account_id=v_sender
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'image_ticket_not_found' USING errcode='42501'; END IF;
  IF v_ticket.attached_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_attached',true);
  END IF;
  IF v_ticket.created_at<now()-interval '20 minutes' THEN RAISE EXCEPTION 'image_ticket_expired'; END IF;
  SELECT * INTO v_msg FROM public.v21_messages WHERE id=v_ticket.message_id;
  IF v_msg.id IS NULL OR v_msg.deleted_at IS NOT NULL
    OR v_msg.sender_account_id IS DISTINCT FROM v_sender
    OR v_msg.conversation_id IS DISTINCT FROM v_ticket.conversation_id
    OR v_msg.client_id NOT IN (
      'taphoa:'||p_command_id::text||':debt',
      'taphoa:'||p_command_id::text||':collection'
    )
    OR NOT v21_private.chat_outbound_allowed(v_ticket.customer_account_id,v_msg.client_id)
  THEN RAISE EXCEPTION 'notification_no_longer_allowed' USING errcode='42501'; END IF;
  SELECT split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),
    coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0)
  INTO v_mime,v_size
  FROM storage.objects o
  WHERE o.bucket_id='v21-media' AND o.name=v_ticket.storage_key
    AND o.owner_id=auth.uid()::text AND o.archived_at IS NULL
    AND NOT o.is_delete_marker LIMIT 1;
  IF v_mime IS DISTINCT FROM 'image/png' OR v_size IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'image_storage_missing_or_invalid';
  END IF;
  INSERT INTO public.v21_media_assets(
    id,conversation_id,message_id,owner_account_id,kind,mime_type,size_bytes,
    storage_key,width_px,height_px,sort_index)
  VALUES(v_ticket.asset_id,v_ticket.conversation_id,v_ticket.message_id,v_sender,
    'image','image/png',p_size_bytes,v_ticket.storage_key,p_width_px,p_height_px,0)
  ON CONFLICT(id) DO NOTHING;
  UPDATE v21_private.taphoa_debt_notice_image_uploads SET attached_at=now()
  WHERE message_id=v_ticket.message_id;
  RETURN jsonb_build_object('ok',true,'asset_id',v_ticket.asset_id,
    'message_id',v_ticket.message_id);
END;
$$;
REVOKE ALL ON FUNCTION public.taphoa_debt_notice_image_attach(uuid,uuid,bigint,integer,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_debt_notice_image_attach(uuid,uuid,bigint,integer,integer) TO authenticated;
