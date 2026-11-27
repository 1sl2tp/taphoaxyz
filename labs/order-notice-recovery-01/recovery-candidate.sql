-- ORDER-NOTICE-RECOVERY-01 candidate, NOT an applied migration.
-- Customer create/deliver/edit and pinned staff, exact committed snapshot, no financial replay.
begin;
-- Existing pinned staff recipient from taphoa_staff_order_notify; never infer from a name.
create or replace function v21_private.taphoa_recovery_order_recipient(
 p_actor uuid,p_room uuid,p_customer uuid,p_client_id text)
returns boolean language sql stable security invoker set search_path=''
as $
 select exists(
   select 1 from public.v21_conversations c
   join public.v21_accounts a on a.id=case when c.member_a=p_actor then c.member_b else c.member_a end
   where c.id=p_room and p_actor in(c.member_a,c.member_b)
     and a.role='user' and a.deleted_at is null and a.locked_at is null
     and case when p_client_id like 'taphoa:%:staff-order'
       then a.id='57fc1306-7030-4955-b174-afffeee2c3d2'::uuid and a.contact_group='friend'
       else a.id=p_customer and a.contact_group='customer'
         and v21_private.chat_outbound_allowed(p_customer,p_client_id)
       end
 )
$;
revoke all on function v21_private.taphoa_recovery_order_recipient(uuid,uuid,uuid,text) from public,anon,authenticated;
create or replace function v21_private.taphoa_order_notice_recover_prepare(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 ctx jsonb:=public.taphoa_access_context();
 actor uuid:=nullif(ctx->>'account_id','')::uuid;
 msg public.v21_messages;
 ord public.taphoa_orders;
 cmd public.taphoa_command_log;
 ticket v21_private.taphoa_order_notice_image_uploads;
 snapshot jsonb;
 asset uuid;
 object_size bigint;
 object_mime text;
 object_owner text;
begin
 if auth.uid() is null or actor is null or ctx->>'taphoa_role' is distinct from 'admin'
  or not coalesce((ctx->>'allowed')::boolean,false)
  or not exists(select 1 from public.v21_accounts a where a.id=actor and a.auth_user_id=auth.uid()
    and a.role='admin' and a.locked_at is null and a.deleted_at is null)
 then raise exception 'taphoa_admin_required' using errcode='42501'; end if;
 select * into msg from public.v21_messages m where m.id=p_message_id
  and m.sender_account_id=actor and m.deleted_at is null and m.body=''
  and m.client_id ~ '^taphoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(order|deliver|order-edit|staff-order)$'
  and m.created_at>=now()-interval '30 days' for update;
 if not found then return jsonb_build_object('ok',false,'reason','notice_not_eligible'); end if;
 select * into cmd from public.taphoa_command_log l
 where l.command_id=split_part(msg.client_id,':',2)::uuid
   and (case split_part(msg.client_id,':',3) when 'staff-order' then l.operation in ('save_order','deliver_order') when 'deliver' then l.operation='deliver_order' else l.operation='save_order' end)
   and l.created_at=msg.created_at and l.result->>'ok'='true';
 if not found then return jsonb_build_object('ok',false,'reason','snapshot_not_found'); end if;
 snapshot:=cmd.result->'order';
 if coalesce(snapshot->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(snapshot->>'status','') not in ('done','delivered')
   or jsonb_typeof(snapshot->'items') is distinct from 'array'
 then return jsonb_build_object('ok',false,'reason','snapshot_invalid'); end if;
 if jsonb_array_length(snapshot->'items') not between 1 and 130 then
   return jsonb_build_object('ok',false,'reason','snapshot_invalid');
 end if;
 select * into ord from public.taphoa_orders o where o.id=(snapshot->>'id')::uuid
  and o.status='delivered' and o.customer_account_id::text is not distinct from nullif(snapshot->>'customer_id','')
  and o.display_prefix||o.display_no::text=snapshot->>'displayCode'
  and o.updated_at=cmd.created_at;
 if not found then return jsonb_build_object('ok',false,'reason','order_changed'); end if;
 if not v21_private.taphoa_recovery_order_recipient(actor,msg.conversation_id,ord.customer_account_id,msg.client_id)
 then return jsonb_build_object('ok',false,'reason','recipient_not_allowed'); end if;
 if exists(select 1 from public.v21_media_assets a where a.message_id=msg.id and a.deleted_at is null) then
   return jsonb_build_object('ok',false,'reason','media_exists_review');
 end if;
 select * into ticket from v21_private.taphoa_order_notice_image_uploads t where t.message_id=msg.id for update;
 if found then
   if ticket.order_id is distinct from ord.id or ticket.sender_account_id is distinct from actor
    or ticket.conversation_id is distinct from msg.conversation_id or ticket.attached_at is not null
    or ticket.storage_key is distinct from actor::text||'/'||msg.conversation_id::text||'/'||ticket.asset_id::text
   then return jsonb_build_object('ok',false,'reason','ticket_conflict'); end if;
   if ticket.created_at>=now()-interval '20 minutes' then
     return jsonb_build_object('ok',false,'reason','active_ticket');
   end if;
   select coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0),
    split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),o.owner_id
    into object_size,object_mime,object_owner
   from storage.objects o where o.bucket_id='v21-media' and o.name=ticket.storage_key
    and o.archived_at is null and not o.is_delete_marker;
   if found then
     -- Existing bytes are never overwritten. A future authenticated client
     -- must validate PNG signature/IHDR and size before reusing the same upload.
     if object_mime is distinct from 'image/png' or object_owner is distinct from auth.uid()::text
       or object_size not between 1 and 15728640
     then return jsonb_build_object('ok',false,'reason','storage_conflict'); end if;
     update v21_private.taphoa_order_notice_image_uploads set created_at=now() where message_id=msg.id;
     return jsonb_build_object('ok',true,'mode','reuse_upload','order',snapshot,'message_id',msg.id,
       'asset_id',ticket.asset_id,'storage_key',ticket.storage_key,'size_bytes',object_size);
   end if;
 else
   if msg.created_at>=now()-interval '20 minutes' then
     return jsonb_build_object('ok',false,'reason','active_notice');
   end if;
 end if;
 -- Missing/expired object: rotate ticket asset; late old upload cannot attach.
 asset:=gen_random_uuid();
 insert into v21_private.taphoa_order_notice_image_uploads
   (message_id,order_id,sender_account_id,conversation_id,asset_id,storage_key,created_at)
 values(msg.id,ord.id,actor,msg.conversation_id,asset,actor::text||'/'||msg.conversation_id::text||'/'||asset::text,now())
 on conflict(message_id) do update set asset_id=excluded.asset_id,storage_key=excluded.storage_key,created_at=excluded.created_at;
 return jsonb_build_object('ok',true,'mode','render_original','order',snapshot,'message_id',msg.id,
   'asset_id',asset,'storage_key',actor::text||'/'||msg.conversation_id::text||'/'||asset::text);
end;
$$;
revoke all on function v21_private.taphoa_order_notice_recover_prepare(uuid) from public,anon,authenticated;
grant execute on function v21_private.taphoa_order_notice_recover_prepare(uuid) to authenticated;
create or replace function public.taphoa_order_notice_recover_prepare(p_message_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select v21_private.taphoa_order_notice_recover_prepare(p_message_id) $$;
revoke all on function public.taphoa_order_notice_recover_prepare(uuid) from public,anon,authenticated;
grant execute on function public.taphoa_order_notice_recover_prepare(uuid) to authenticated;

-- Revalidate the exact snapshot at attachment time; do not trust client order IDs.
create or replace function v21_private.taphoa_order_notice_recover_attach(
 p_message_id uuid,p_asset_id uuid,p_size_bytes bigint,p_width_px integer,p_height_px integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 ctx jsonb:=public.taphoa_access_context();
 actor uuid:=nullif(ctx->>'account_id','')::uuid;
 msg public.v21_messages;
 ord public.taphoa_orders;
 cmd public.taphoa_command_log;
 ticket v21_private.taphoa_order_notice_image_uploads;
 ack jsonb;
begin
 if auth.uid() is null or actor is null or ctx->>'taphoa_role' is distinct from 'admin'
  or not coalesce((ctx->>'allowed')::boolean,false)
  or not exists(select 1 from public.v21_accounts a where a.id=actor and a.auth_user_id=auth.uid()
    and a.role='admin' and a.locked_at is null and a.deleted_at is null)
 then raise exception 'taphoa_admin_required' using errcode='42501'; end if;
 select * into msg from public.v21_messages m where m.id=p_message_id
  and m.sender_account_id=actor and m.deleted_at is null and m.body=''
  and m.client_id ~ '^taphoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(order|deliver|order-edit|staff-order)$'
  and m.created_at>=now()-interval '30 days' for update;
 if not found then raise exception 'notice_not_eligible' using errcode='42501'; end if;
 select * into cmd from public.taphoa_command_log l
 where l.command_id=split_part(msg.client_id,':',2)::uuid
   and (case split_part(msg.client_id,':',3) when 'staff-order' then l.operation in ('save_order','deliver_order') when 'deliver' then l.operation='deliver_order' else l.operation='save_order' end)
   and l.created_at=msg.created_at and l.result->>'ok'='true';
 if not found then raise exception 'snapshot_not_found'; end if;
 select * into ticket from v21_private.taphoa_order_notice_image_uploads t where t.message_id=msg.id
   and t.asset_id=p_asset_id and t.sender_account_id=actor and t.conversation_id=msg.conversation_id
   and t.storage_key=actor::text||'/'||msg.conversation_id::text||'/'||p_asset_id::text for update;
 if not found then raise exception 'ticket_conflict' using errcode='42501'; end if;
 select * into ord from public.taphoa_orders o where o.id=ticket.order_id
   and o.id::text=cmd.result->'order'->>'id' and o.status='delivered'
   and o.customer_account_id::text is not distinct from nullif(cmd.result->'order'->>'customer_id','')
   and o.display_prefix||o.display_no::text=cmd.result->'order'->>'displayCode'
   and o.updated_at=cmd.created_at for share;
 if not found then raise exception 'order_changed'; end if;
 if not v21_private.taphoa_recovery_order_recipient(actor,msg.conversation_id,ord.customer_account_id,msg.client_id)
 then raise exception 'recipient_not_allowed' using errcode='42501'; end if;
 if exists(select 1 from public.v21_media_assets a where a.message_id=msg.id and a.deleted_at is null and a.id<>p_asset_id)
 then raise exception 'media_exists_review'; end if;
 if msg.client_id like 'taphoa:%:staff-order' then
   ack:=public.taphoa_staff_order_image_attach(ord.id,cmd.command_id,p_asset_id,p_size_bytes,p_width_px,p_height_px);
 else
   ack:=public.taphoa_order_notice_image_attach(ord.id,p_asset_id,p_size_bytes,p_width_px,p_height_px);
 end if;
 if ack->>'ok' is distinct from 'true' or ack->>'message_id' is distinct from msg.id::text
   or not exists(select 1 from public.v21_media_assets a
      join storage.objects o on o.bucket_id='v21-media' and o.name=a.storage_key
       and o.archived_at is null and not o.is_delete_marker
      where a.id=p_asset_id and a.message_id=msg.id and a.conversation_id=msg.conversation_id
       and a.owner_account_id=actor and a.deleted_at is null and a.kind='image' and a.mime_type='image/png'
       and a.storage_key=ticket.storage_key and a.size_bytes=p_size_bytes
       and a.width_px=p_width_px and a.height_px=p_height_px)
 then raise exception 'image_ack_unverified'; end if;
 return jsonb_build_object('ok',true,'message_id',msg.id,'asset_id',p_asset_id,'order_id',ord.id);
end;
$$;
revoke all on function v21_private.taphoa_order_notice_recover_attach(uuid,uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function v21_private.taphoa_order_notice_recover_attach(uuid,uuid,bigint,integer,integer) to authenticated;
create or replace function public.taphoa_order_notice_recover_attach(
 p_message_id uuid,p_asset_id uuid,p_size_bytes bigint,p_width_px integer,p_height_px integer)
returns jsonb language sql security invoker set search_path=''
as $$ select v21_private.taphoa_order_notice_recover_attach(p_message_id,p_asset_id,p_size_bytes,p_width_px,p_height_px) $$;
revoke all on function public.taphoa_order_notice_recover_attach(uuid,uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.taphoa_order_notice_recover_attach(uuid,uuid,bigint,integer,integer) to authenticated;
-- Durable pending discovery: original message envelopes are the source of truth.
-- No claim, new message or notification is emitted by listing.
create or replace function v21_private.taphoa_order_notice_recover_list(p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path=''
as $
declare ctx jsonb:=public.taphoa_access_context(); actor uuid:=nullif(ctx->>'account_id','')::uuid; result jsonb;
begin
 if auth.uid() is null or actor is null or ctx->>'taphoa_role' is distinct from 'admin'
  or not coalesce((ctx->>'allowed')::boolean,false)
  or not exists(select 1 from public.v21_accounts a where a.id=actor and a.auth_user_id=auth.uid()
   and a.role='admin' and a.locked_at is null and a.deleted_at is null)
 then raise exception 'taphoa_admin_required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('message_id',q.id,'kind',q.kind,'created_at',q.created_at) order by q.created_at,q.id),'[]'::jsonb)
 into result
 from (
  select m.id,m.created_at,split_part(m.client_id,':',3) as kind
  from public.v21_messages m
  join public.taphoa_command_log l on l.command_id::text=split_part(m.client_id,':',2)
   and l.created_at=m.created_at and l.result->>'ok'='true'
   and (case split_part(m.client_id,':',3) when 'staff-order' then l.operation in ('save_order','deliver_order') when 'deliver' then l.operation='deliver_order' else l.operation='save_order' end)
  join public.taphoa_orders o on o.id::text=l.result->'order'->>'id' and o.status='delivered'
   and o.updated_at=l.created_at and o.customer_account_id::text is not distinct from nullif(l.result->'order'->>'customer_id','')
   and o.display_prefix||o.display_no::text=l.result->'order'->>'displayCode'
  left join v21_private.taphoa_order_notice_image_uploads t on t.message_id=m.id
  where m.sender_account_id=actor and m.deleted_at is null and m.body=''
   and m.client_id ~ '^taphoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(order|order-edit|deliver|staff-order)
   and m.created_at between now()-interval '30 days' and now()-interval '20 minutes'
   and t.attached_at is null and (t.created_at is null or t.created_at<now()-interval '20 minutes')
   and not exists(select 1 from public.v21_media_assets a where a.message_id=m.id and a.deleted_at is null)
   and v21_private.taphoa_recovery_order_recipient(actor,m.conversation_id,o.customer_account_id,m.client_id)
  order by m.created_at,m.id limit least(greatest(coalesce(p_limit,5),1),10)
 ) q;
 return result;
end;
$;
revoke all on function v21_private.taphoa_order_notice_recover_list(integer) from public,anon,authenticated;
grant execute on function v21_private.taphoa_order_notice_recover_list(integer) to authenticated;
create or replace function public.taphoa_order_notice_recover_list(p_limit integer default 5)
returns jsonb language sql stable security invoker set search_path=''
as $ select v21_private.taphoa_order_notice_recover_list(p_limit) $;
revoke all on function public.taphoa_order_notice_recover_list(integer) from public,anon,authenticated;
grant execute on function public.taphoa_order_notice_recover_list(integer) to authenticated;
commit;
