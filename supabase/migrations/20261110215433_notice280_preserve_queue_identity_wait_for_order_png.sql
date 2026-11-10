-- NOTICE-280: prevent daytime replay of queued command from cancelling
-- its own pending row; wait briefly for an uploaded portrait before sending.
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
  v_url text;
  v_release timestamptz;
  v_dispatch_day date;
begin
  -- All automated business messages require both global and per-customer opt-in.
  -- Never gate manual Chat/Zalo messages or change order/debt processing.
  if v_client_id like 'taphoa:%' or v_client_id like 'care:auto:%' then
    if not v21_private.chat_outbound_allowed(p_customer_id,v_client_id) then
      return null;
    end if;
  end if;
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

  if v_client_id like 'taphoa:%:order-edit'
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

  -- Preserve transaction-provided collection note, old/new balance and ledger URL.

  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

  -- NOTICE-277: do NOT publish edit notices (Chat/Zalo/push) overnight.
  -- Save the business transaction immediately. Next morning send at most
  -- one latest order snapshot to the opted-in customer for each edited order.
  IF v_client_id LIKE 'taphoa:%:order-edit' THEN
    v_release:=v21_private.taphoa_order_edit_quiet_release(now());
    IF v_release IS NOT NULL THEN
      -- Fail closed if the client_id/body cannot prove an edited delivered
      -- order; never send an unidentified edit notice during quiet hours.
      IF v_order.id IS NULL OR v_order.status<>'delivered' THEN RETURN NULL; END IF;
      v_dispatch_day:=(v_release AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
      -- An unprocessed reminder from an older morning is superseded.
      UPDATE v21_private.taphoa_order_edit_quiet_queue q
        SET status='skipped',skip_reason='newer_order_edit',updated_at=now()
        WHERE q.order_id=v_order.id AND q.status='pending'
          AND q.dispatch_date_vn<>v_dispatch_day;
      INSERT INTO v21_private.taphoa_order_edit_quiet_queue(
        order_id,dispatch_date_vn,customer_account_id,sender_account_id,
        client_id,body,send_after)
      VALUES (v_order.id,v_dispatch_day,p_customer_id,p_sender_account_id,
        v_client_id,v_body,v_release)
      ON CONFLICT(order_id,dispatch_date_vn) DO UPDATE SET
        customer_account_id=excluded.customer_account_id,
        sender_account_id=excluded.sender_account_id,
        client_id=excluded.client_id,
        body=excluded.body,
        send_after=excluded.send_after,
        updated_at=now(),
        staged_asset_id=NULL,
        staged_conversation_id=NULL,
        staged_storage_key=NULL,
        staged_size_bytes=NULL,
        staged_width_px=NULL,
        staged_height_px=NULL,
        staged_ready_at=NULL,
        last_error=NULL
      WHERE v21_private.taphoa_order_edit_quiet_queue.status='pending';
      RETURN NULL;
    END IF;
    -- A new daytime correction takes precedence over any undelivered
    -- previous-night copy. Do not send a stale second notice at 08:05.
    IF v_order.id IS NOT NULL THEN
      UPDATE v21_private.taphoa_order_edit_quiet_queue q
      SET status='skipped',skip_reason='newer_daytime_order_edit',updated_at=now()
      WHERE q.order_id=v_order.id AND q.status='pending'
        AND q.client_id IS DISTINCT FROM v_client_id;
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION v21_private.taphoa_order_edit_quiet_dispatch()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'storage', 'pg_temp'
AS $function$
DECLARE
 v_job v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;
 v_order public.taphoa_orders;
 v_message public.v21_messages;
 v_message_id uuid;
 v_sent integer:=0;
 v_skipped integer:=0;
 v_failed integer:=0;
 v_images integer:=0;
 v_images_missing integer:=0;
 v_local_time time:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
BEGIN
 IF v_local_time<time '08:05' OR v_local_time>=time '20:00' THEN
   RETURN jsonb_build_object('ok',true,'status','quiet','sent',0);
 END IF;
 FOR v_job IN
  SELECT * FROM v21_private.taphoa_order_edit_quiet_queue q
  WHERE q.status='pending' AND q.send_after<=now()
    AND q.updated_at<=now()-interval '90 seconds'
    -- If the admin is still preparing the PNG, allow up to 15 minutes
    -- after the last edit before falling back to text+link.
    AND (q.staged_asset_id IS NULL OR q.staged_ready_at IS NOT NULL
      OR q.updated_at<=now()-interval '15 minutes')
  ORDER BY q.send_after,q.updated_at,q.order_id
  LIMIT 25 FOR UPDATE SKIP LOCKED
 LOOP
  BEGIN
   SELECT * INTO v_order FROM public.taphoa_orders o
     WHERE o.id=v_job.order_id;
   IF v_order.id IS NULL OR v_order.status<>'delivered'
      OR v_order.customer_account_id IS DISTINCT FROM v_job.customer_account_id THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='order_changed_or_removed'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   IF NOT v21_private.chat_outbound_allowed(v_job.customer_account_id,v_job.client_id) THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='customer_opted_out'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   -- A morning release is a genuine new Chat message. Only then do the
   -- existing Chat sync, Zalo and media triggers see the notice.
   v_message_id:=public.taphoa_chat_notify_customer(
     v_job.customer_account_id,v_job.sender_account_id,
     v_job.client_id,v_job.body);
   IF v_message_id IS NULL THEN
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET status='skipped',skip_reason='notify_no_longer_allowed'
       WHERE order_id=v_job.order_id AND dispatch_date_vn=v_job.dispatch_date_vn;
     v_skipped:=v_skipped+1;
     CONTINUE;
   END IF;
   SELECT * INTO v_message FROM public.v21_messages WHERE id=v_message_id;
   IF v_message.id IS NULL OR v_message.deleted_at IS NOT NULL
      OR v_message.sender_account_id IS DISTINCT FROM v_job.sender_account_id
      OR v_message.client_id IS DISTINCT FROM v_job.client_id THEN
      RAISE EXCEPTION 'quiet_edit_message_identity_mismatch';
   END IF;
   IF v_job.staged_ready_at IS NOT NULL THEN
     IF v_job.staged_asset_id IS NOT NULL
        AND v_job.staged_storage_key IS NOT NULL
        AND v_job.staged_size_bytes BETWEEN 1 AND 15728640
        AND v_job.staged_width_px BETWEEN 1 AND 20000
        AND v_job.staged_height_px BETWEEN 1 AND 20000
        AND EXISTS (
         SELECT 1 FROM storage.objects o
         JOIN public.v21_accounts a ON a.id=v_job.sender_account_id
         WHERE o.bucket_id='v21-media' AND o.name=v_job.staged_storage_key
          AND o.owner_id=a.auth_user_id::text
          AND o.archived_at IS NULL AND NOT o.is_delete_marker
          AND split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1)='image/png'
          AND coalesce((o.metadata->>'size')::bigint,
                       (o.metadata->>'contentLength')::bigint,0)=v_job.staged_size_bytes
        )
     THEN
       INSERT INTO public.v21_media_assets(
         id,conversation_id,message_id,owner_account_id,kind,mime_type,
         size_bytes,storage_key,width_px,height_px,sort_index)
       VALUES (v_job.staged_asset_id,v_message.conversation_id,
         v_message.id,v_job.sender_account_id,'image','image/png',
         v_job.staged_size_bytes,v_job.staged_storage_key,
         v_job.staged_width_px,v_job.staged_height_px,0)
       ON CONFLICT(id) DO NOTHING;
       v_images:=v_images+1;
     ELSE
       v_images_missing:=v_images_missing+1;
     END IF;
   END IF;
   UPDATE v21_private.taphoa_order_edit_quiet_queue q
     SET status='sent',message_id=v_message.id,sent_at=now(),last_error=NULL
     WHERE q.order_id=v_job.order_id AND q.dispatch_date_vn=v_job.dispatch_date_vn
       AND q.status='pending';
   v_sent:=v_sent+1;
  EXCEPTION WHEN OTHERS THEN
    -- Per-row savepoint: failed image/message never partially commits.
    -- Retry on subsequent daytime cron runs without notifying twice.
    UPDATE v21_private.taphoa_order_edit_quiet_queue q
      SET attempts=attempts+1,last_error=left(SQLERRM,300)
      WHERE q.order_id=v_job.order_id AND q.dispatch_date_vn=v_job.dispatch_date_vn
        AND q.status='pending';
    v_failed:=v_failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('ok',v_failed=0,'status','processed',
   'sent',v_sent,'skipped',v_skipped,'errors',v_failed,
   'images_attached',v_images,'images_missing',v_images_missing);
END;
$function$;
