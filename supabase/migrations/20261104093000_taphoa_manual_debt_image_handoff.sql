-- SPEC-TAPHOA-MANUAL-DEBT-PNG-20261104 (SOURCE ONLY: do not apply to production automatically)
-- Explicit Admin "Gui cong no" reuses its existing manual:debt:<request_uuid> Chat message.
-- The text message exists before a PNG ticket can be issued; attachment is independent of Zalo delivery.
-- No finance/order writes, no new timer/polling, no automatic customer notification.
-- New private ticket and storage policy are isolated from automatic finance image policies.

CREATE TABLE IF NOT EXISTS v21_private.taphoa_manual_debt_image_uploads(
  message_id uuid PRIMARY KEY REFERENCES public.v21_messages(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  sender_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  conversation_id uuid NOT NULL REFERENCES public.v21_conversations(id),
  asset_id uuid NOT NULL UNIQUE,
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_at timestamptz
);
ALTER TABLE v21_private.taphoa_manual_debt_image_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON v21_private.taphoa_manual_debt_image_uploads FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.taphoa_manual_debt_image_ticket(
  p_customer_id uuid,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp
AS $$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_message public.v21_messages;
  v_ticket v21_private.taphoa_manual_debt_image_uploads;
  v_asset uuid;
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin' OR v_sender IS NULL OR auth.uid() IS NULL
  THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
  IF p_customer_id IS NULL OR p_request_id IS NULL
  THEN RAISE EXCEPTION 'manual_debt_image_request_required'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.v21_accounts a
    WHERE a.id=p_customer_id AND a.role='user' AND a.contact_group='customer'
      AND a.deleted_at IS NULL AND a.locked_at IS NULL
  ) THEN RETURN jsonb_build_object('ok',false,'reason','customer_not_found'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'manual-debt-image:'||v_sender::text||':'||p_request_id::text,0
  ));
  SELECT m.* INTO v_message
  FROM public.v21_messages m
  JOIN public.v21_conversations c ON c.id=m.conversation_id
  WHERE m.sender_account_id=v_sender AND m.deleted_at IS NULL
    AND m.client_id='manual:debt:'||p_request_id::text
    AND (c.member_a=v_sender OR c.member_b=v_sender)
    AND (c.member_a=p_customer_id OR c.member_b=p_customer_id)
    AND m.created_at>=now()-interval '20 minutes'
  ORDER BY m.created_at DESC LIMIT 1;
  IF v_message.id IS NULL
  THEN RETURN jsonb_build_object('ok',false,'reason','manual_notice_not_found_or_expired'); END IF;

  SELECT * INTO v_ticket FROM v21_private.taphoa_manual_debt_image_uploads
  WHERE message_id=v_message.id;
  IF FOUND THEN
    IF v_ticket.request_id IS DISTINCT FROM p_request_id
      OR v_ticket.customer_account_id IS DISTINCT FROM p_customer_id
      OR v_ticket.sender_account_id IS DISTINCT FROM v_sender
      OR v_ticket.conversation_id IS DISTINCT FROM v_message.conversation_id
    THEN RAISE EXCEPTION 'manual_image_ticket_owner_mismatch' USING errcode='42501'; END IF;
    IF v_ticket.attached_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok',true,'already_attached',true,
        'message_id',v_ticket.message_id,'asset_id',v_ticket.asset_id);
    END IF;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.v21_media_assets a
    WHERE a.message_id=v_message.id AND a.kind='image' AND a.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok',false,'reason','image_already_attached');
  END IF;
  IF v_ticket.message_id IS NULL THEN
    v_asset:=gen_random_uuid();
    INSERT INTO v21_private.taphoa_manual_debt_image_uploads(
      message_id,request_id,customer_account_id,sender_account_id,
      conversation_id,asset_id,storage_key
    ) VALUES(
      v_message.id,p_request_id,p_customer_id,v_sender,v_message.conversation_id,
      v_asset,v_sender::text||'/'||v_message.conversation_id::text||'/'||v_asset::text
    ) ON CONFLICT(message_id) DO NOTHING;
    SELECT * INTO v_ticket FROM v21_private.taphoa_manual_debt_image_uploads
    WHERE message_id=v_message.id;
  END IF;
  IF v_ticket.message_id IS NULL OR v_ticket.request_id IS DISTINCT FROM p_request_id
    OR v_ticket.sender_account_id IS DISTINCT FROM v_sender
    OR v_ticket.customer_account_id IS DISTINCT FROM p_customer_id
  THEN RAISE EXCEPTION 'manual_image_ticket_invalid' USING errcode='42501'; END IF;
  IF v_ticket.created_at<now()-interval '20 minutes'
  THEN RETURN jsonb_build_object('ok',false,'reason','image_ticket_expired'); END IF;
  RETURN jsonb_build_object('ok',true,'message_id',v_ticket.message_id,
    'asset_id',v_ticket.asset_id,'storage_key',v_ticket.storage_key);
END;
$$;
REVOKE ALL ON FUNCTION public.taphoa_manual_debt_image_ticket(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_manual_debt_image_ticket(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION v21_storage_private.can_upload_taphoa_manual_debt_image(
  p_object_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(
    SELECT 1 FROM v21_private.taphoa_manual_debt_image_uploads t
    JOIN public.v21_accounts a ON a.id=t.sender_account_id
    JOIN public.v21_accounts recipient ON recipient.id=t.customer_account_id
    JOIN public.v21_messages m ON m.id=t.message_id
    JOIN public.v21_conversations c ON c.id=t.conversation_id
    WHERE t.storage_key=p_object_name AND t.attached_at IS NULL
      AND t.created_at>=now()-interval '20 minutes'
      AND a.auth_user_id=auth.uid() AND a.role='admin' AND a.deleted_at IS NULL
      AND a.locked_at IS NULL
      AND recipient.role='user' AND recipient.contact_group='customer'
      AND recipient.deleted_at IS NULL AND recipient.locked_at IS NULL
      AND m.deleted_at IS NULL AND m.sender_account_id=a.id
      AND m.conversation_id=c.id AND m.client_id='manual:debt:'||t.request_id::text
      AND (c.member_a=a.id OR c.member_b=a.id)
      AND (c.member_a=t.customer_account_id OR c.member_b=t.customer_account_id)
  );
$$;
REVOKE ALL ON FUNCTION v21_storage_private.can_upload_taphoa_manual_debt_image(text)
  FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION v21_storage_private.can_upload_taphoa_manual_debt_image(text)
  TO authenticated;

DROP POLICY IF EXISTS v21_taphoa_manual_debt_image_upload ON storage.objects;
CREATE POLICY v21_taphoa_manual_debt_image_upload
ON storage.objects FOR INSERT TO authenticated
WITH CHECK(
  bucket_id='v21-media' AND
  v21_storage_private.can_upload_taphoa_manual_debt_image(name)
);

CREATE OR REPLACE FUNCTION public.taphoa_manual_debt_image_attach(
  p_request_id uuid,p_asset_id uuid,p_size_bytes bigint,p_width_px integer,p_height_px integer
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO public,v21_private,auth,storage,pg_temp
AS $$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_ticket v21_private.taphoa_manual_debt_image_uploads;
  v_message public.v21_messages;
  v_recipient public.v21_accounts;
  v_mime text;
  v_size bigint;
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin' OR v_sender IS NULL OR auth.uid() IS NULL
  THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
  IF p_request_id IS NULL OR p_asset_id IS NULL
    OR coalesce(p_size_bytes,0)<1 OR p_size_bytes>15728640
    OR coalesce(p_width_px,0)<1 OR p_width_px>20000
    OR coalesce(p_height_px,0)<1 OR p_height_px>20000
  THEN RAISE EXCEPTION 'image_metadata_invalid'; END IF;

  SELECT * INTO v_ticket FROM v21_private.taphoa_manual_debt_image_uploads
  WHERE request_id=p_request_id AND asset_id=p_asset_id AND sender_account_id=v_sender
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual_image_ticket_not_found' USING errcode='42501'; END IF;
  IF v_ticket.attached_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_attached',true,
      'message_id',v_ticket.message_id,'asset_id',v_ticket.asset_id);
  END IF;
  IF v_ticket.created_at<now()-interval '20 minutes'
  THEN RAISE EXCEPTION 'manual_image_ticket_expired'; END IF;

  SELECT * INTO v_message FROM public.v21_messages WHERE id=v_ticket.message_id;
  SELECT * INTO v_recipient FROM public.v21_accounts
  WHERE id=v_ticket.customer_account_id;
  IF v_message.id IS NULL OR v_message.deleted_at IS NOT NULL
    OR v_message.sender_account_id IS DISTINCT FROM v_sender
    OR v_message.conversation_id IS DISTINCT FROM v_ticket.conversation_id
    OR v_message.client_id IS DISTINCT FROM 'manual:debt:'||p_request_id::text
    OR v_recipient.role IS DISTINCT FROM 'user'
    OR v_recipient.contact_group IS DISTINCT FROM 'customer'
    OR v_recipient.deleted_at IS NOT NULL OR v_recipient.locked_at IS NOT NULL
    OR NOT EXISTS(
      SELECT 1 FROM public.v21_conversations c
      WHERE c.id=v_ticket.conversation_id
        AND (c.member_a=v_sender OR c.member_b=v_sender)
        AND (c.member_a=v_ticket.customer_account_id OR c.member_b=v_ticket.customer_account_id)
    )
  THEN RAISE EXCEPTION 'manual_notice_no_longer_allowed' USING errcode='42501'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.v21_media_assets a
    WHERE a.message_id=v_message.id AND a.kind='image'
      AND a.deleted_at IS NULL AND a.id<>p_asset_id
  ) THEN RAISE EXCEPTION 'image_already_attached' USING errcode='23505'; END IF;

  SELECT split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),
    coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0)
  INTO v_mime,v_size
  FROM storage.objects o
  WHERE o.bucket_id='v21-media' AND o.name=v_ticket.storage_key
    AND o.owner_id=auth.uid()::text AND o.archived_at IS NULL
    AND NOT o.is_delete_marker LIMIT 1;
  IF v_mime IS DISTINCT FROM 'image/png' OR v_size IS DISTINCT FROM p_size_bytes
  THEN RAISE EXCEPTION 'image_storage_missing_or_invalid'; END IF;

  INSERT INTO public.v21_media_assets(
    id,conversation_id,message_id,owner_account_id,kind,mime_type,size_bytes,
    storage_key,width_px,height_px,sort_index
  ) VALUES(
    v_ticket.asset_id,v_ticket.conversation_id,v_ticket.message_id,v_sender,
    'image','image/png',p_size_bytes,v_ticket.storage_key,p_width_px,p_height_px,0
  ) ON CONFLICT(id) DO NOTHING;
  UPDATE v21_private.taphoa_manual_debt_image_uploads
  SET attached_at=now() WHERE message_id=v_ticket.message_id;
  RETURN jsonb_build_object('ok',true,'message_id',v_ticket.message_id,
    'asset_id',v_ticket.asset_id);
END;
$$;
REVOKE ALL ON FUNCTION public.taphoa_manual_debt_image_attach(uuid,uuid,bigint,integer,integer)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_manual_debt_image_attach(uuid,uuid,bigint,integer,integer)
  TO authenticated;
