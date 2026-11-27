-- Isolated disposable PostgreSQL fixture; never run against production.
create role anon;
create role authenticated;
create schema auth;
create schema v21_private;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
create function public.taphoa_access_context() returns jsonb language sql stable as $$select jsonb_build_object('allowed',true,'taphoa_role','admin','account_id',current_setting('fixture.actor',true))$$;
create function v21_private.chat_outbound_allowed(uuid,text) returns boolean language sql stable as $$select current_setting('fixture.optin',true)='yes'$$;
create table public.v21_accounts(id uuid primary key,auth_user_id uuid,role text,contact_group text,locked_at timestamptz,deleted_at timestamptz);
create table public.v21_conversations(id uuid primary key,member_a uuid,member_b uuid);
create table public.v21_messages(id uuid primary key,sender_account_id uuid,conversation_id uuid,body text,client_id text,created_at timestamptz,deleted_at timestamptz);
create table public.taphoa_orders(id uuid primary key,status text,customer_account_id uuid,display_prefix text,display_no bigint,updated_at timestamptz);
create table public.taphoa_command_log(command_id uuid primary key,operation text,result jsonb,created_at timestamptz);
create table v21_private.taphoa_order_notice_image_uploads(message_id uuid primary key,order_id uuid,sender_account_id uuid,conversation_id uuid,asset_id uuid unique,storage_key text,created_at timestamptz,attached_at timestamptz);
create table public.v21_media_assets(id uuid primary key,message_id uuid,conversation_id uuid,owner_account_id uuid,kind text,mime_type text,storage_key text,size_bytes bigint,width_px integer,height_px integer,deleted_at timestamptz);
create table storage.objects(bucket_id text,name text,metadata jsonb,owner_id text,archived_at timestamptz,is_delete_marker boolean default false,primary key(bucket_id,name));
-- Stub legacy attachment contract, not the full live function. Test the new wrapper separately.
create function public.taphoa_order_notice_image_attach(uuid,uuid,bigint,integer,integer) returns jsonb language plpgsql as $$
declare t v21_private.taphoa_order_notice_image_uploads;
begin
 select * into strict t from v21_private.taphoa_order_notice_image_uploads where order_id=$1 and asset_id=$2;
 if not exists(select 1 from storage.objects where bucket_id='v21-media' and name=t.storage_key and (metadata->>'size')::bigint=$3 and owner_id=auth.uid()::text) then raise exception 'missing_storage'; end if;
 insert into public.v21_media_assets values($2,t.message_id,t.conversation_id,t.sender_account_id,'image','image/png',t.storage_key,$3,$4,$5,null) on conflict(id) do nothing;
 update v21_private.taphoa_order_notice_image_uploads set attached_at=now() where message_id=t.message_id;
 return jsonb_build_object('ok',true,'message_id',t.message_id,'asset_id',$2);
end $$;
create function public.taphoa_staff_order_image_attach(uuid,uuid,uuid,bigint,integer,integer) returns jsonb language sql as $$select public.taphoa_order_notice_image_attach($1,$3,$4,$5,$6)$$;
grant usage on schema v21_private to authenticated;
\ir recovery-candidate.sql
do $$
declare
 actor constant uuid:='00000000-0000-4000-8000-000000000001';
 uid constant uuid:='00000000-0000-4000-8000-000000000002';
 customer constant uuid:='00000000-0000-4000-8000-000000000003';
 room constant uuid:='00000000-0000-4000-8000-000000000004';
 oid constant uuid:='00000000-0000-4000-8000-000000000005';
 cid constant uuid:='00000000-0000-4000-8000-000000000006';
 mid constant uuid:='00000000-0000-4000-8000-000000000007';
 old_asset constant uuid:='00000000-0000-4000-8000-000000000008';
 ts timestamptz:=now()-interval '4 days';
 result jsonb; asset uuid; key text; denied boolean;
begin
 perform set_config('fixture.uid',uid::text,true);
 perform set_config('fixture.actor',actor::text,true);
 perform set_config('fixture.optin','yes',true);
 insert into public.v21_accounts values(actor,uid,'admin',null,null,null),(customer,null,'user','customer',null,null);
 insert into public.v21_conversations values(room,actor,customer);
 insert into public.taphoa_orders values(oid,'delivered',customer,'DG',1,ts);
 insert into public.taphoa_command_log values(cid,'save_order',jsonb_build_object('ok',true,'order',jsonb_build_object('id',oid,'customer_id',customer,'status','done','displayCode','DG1','items',jsonb_build_array(jsonb_build_object('qty',1)))),ts);
 insert into public.v21_messages values(mid,actor,room,'','taphoa:'||cid||':order',ts,null);
 insert into v21_private.taphoa_order_notice_image_uploads values(mid,oid,actor,room,old_asset,actor||'/'||room||'/'||old_asset,ts,null);
 if has_function_privilege('anon','public.taphoa_order_notice_recover_prepare(uuid)','execute') or has_function_privilege('anon','public.taphoa_order_notice_recover_attach(uuid,uuid,bigint,integer,integer)','execute') then raise exception 'anonymous grant'; end if;
 perform set_config('fixture.uid','',true);
 denied:=false;
 begin perform public.taphoa_order_notice_recover_prepare(mid); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unauthenticated accepted'; end if;
 perform set_config('fixture.uid',uid::text,true);
 perform set_config('fixture.optin','no',true);
 if public.taphoa_order_notice_recover_prepare(mid)->>'reason'<>'recipient_not_allowed' then raise exception 'optout'; end if;
 perform set_config('fixture.optin','yes',true);
 update public.taphoa_orders set updated_at=now() where id=oid;
 if public.taphoa_order_notice_recover_prepare(mid)->>'reason'<>'order_changed' then raise exception 'stale order'; end if;
 update public.taphoa_orders set updated_at=ts where id=oid;
 if jsonb_array_length(public.taphoa_order_notice_recover_list(5,false))<>0 then raise exception 'historical auto replay'; end if;
 if jsonb_array_length(public.taphoa_order_notice_recover_list(5,true))<>1 then raise exception 'historical discovery'; end if;
 result:=public.taphoa_order_notice_recover_prepare(mid);
 asset:=(result->>'asset_id')::uuid;key:=result->>'storage_key';
 if result->>'mode'<>'render_original' or asset=old_asset or result->>'message_id'<>mid::text then raise exception 'expired repair failed %',result; end if;
 if public.taphoa_order_notice_recover_prepare(mid)->>'reason'<>'active_ticket' then raise exception 'duplicate lease'; end if;
 insert into storage.objects(bucket_id,name,metadata,owner_id) values('v21-media',key,jsonb_build_object('size',100,'mimetype','image/png'),uid::text);
 update v21_private.taphoa_order_notice_image_uploads set created_at=ts where message_id=mid;
 result:=public.taphoa_order_notice_recover_prepare(mid);
 if result->>'mode'<>'reuse_upload' or result->>'asset_id'<>asset::text then raise exception 'reuse failed %',result; end if;
 denied:=false;
 begin perform public.taphoa_order_notice_recover_attach(mid,old_asset,100,528,450); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'old asset accepted'; end if;
 update public.taphoa_orders set updated_at=now() where id=oid;
 denied:=false;
 begin perform public.taphoa_order_notice_recover_attach(mid,asset,100,528,450); exception when others then if sqlerrm='order_changed' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'changed order attached'; end if;
 update public.taphoa_orders set updated_at=ts where id=oid;
 result:=public.taphoa_order_notice_recover_attach(mid,asset,100,528,450);
 if result->>'ok'<>'true' then raise exception 'attach'; end if;
 result:=public.taphoa_order_notice_recover_attach(mid,asset,100,528,450);
 if result->>'ok'<>'true' or (select count(*) from public.v21_media_assets)<>1 then raise exception 'idempotent retry'; end if;
 if (select count(*) from public.v21_messages)<>1 or (select count(*) from public.taphoa_orders)<>1 or (select count(*) from public.taphoa_command_log)<>1 then raise exception 'business replay'; end if;
 raise notice 'ORDER-NOTICE-RECOVERY-01 fixture passed';
end $$;

-- Separate staff recipient, same committed order; customer opt-out does not reroute staff.
do $$
declare
 actor constant uuid:='00000000-0000-4000-8000-000000000001';
 uid constant uuid:='00000000-0000-4000-8000-000000000002';
 staff constant uuid:='57fc1306-7030-4955-b174-afffeee2c3d2';
 room constant uuid:='00000000-0000-4000-8000-000000000014';
 cid constant uuid:='00000000-0000-4000-8000-000000000006';
 mid constant uuid:='00000000-0000-4000-8000-000000000017';
 result jsonb; asset uuid; ts timestamptz;
begin
 perform set_config('fixture.uid',uid::text,true);
 perform set_config('fixture.actor',actor::text,true);
 perform set_config('fixture.optin','no',true);
 select created_at into ts from public.taphoa_command_log where command_id=cid;
 insert into public.v21_accounts values(staff,null,'user','friend',null,null);
 insert into public.v21_conversations values(room,actor,staff);
 insert into public.v21_messages values(mid,actor,room,'','taphoa:'||cid||':staff-order',ts,null);
 update public.v21_accounts set locked_at=now() where id=staff;
 if public.taphoa_order_notice_recover_prepare(mid)->>'reason'<>'recipient_not_allowed' then raise exception 'locked staff accepted'; end if;
 update public.v21_accounts set locked_at=null where id=staff;
 result:=public.taphoa_order_notice_recover_prepare(mid);
 if result->>'mode'<>'render_original' then raise exception 'staff prepare %',result; end if;
 asset:=(result->>'asset_id')::uuid;
 insert into storage.objects(bucket_id,name,metadata,owner_id) values('v21-media',result->>'storage_key',jsonb_build_object('size',100,'mimetype','image/png'),uid::text);
 result:=public.taphoa_order_notice_recover_attach(mid,asset,100,528,450);
 if result->>'ok'<>'true' or result->>'message_id'<>mid::text then raise exception 'staff attach'; end if;
 if (select count(*) from public.v21_media_assets)<>2 then raise exception 'staff/customer media identity'; end if;
 raise notice 'staff recovery passed';
end $$;
