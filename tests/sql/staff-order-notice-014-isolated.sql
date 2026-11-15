-- STAFF-ORDER-014: executable contract against a throwaway Postgres 17 database.
-- No production data, no real messaging/Zalo, no network. Run only via isolated CI.
\set ON_ERROR_STOP on
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   CREATE ROLE authenticated NOLOGIN;
 END IF;
END $roles$;
CREATE SCHEMA v21_private;

CREATE TABLE public.v21_accounts (
 id uuid PRIMARY KEY,
 role text NOT NULL,
 contact_group text,
 deleted_at timestamptz,
 locked_at timestamptz
);
CREATE TABLE public.v21_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_a uuid NOT NULL REFERENCES public.v21_accounts(id),
 member_b uuid NOT NULL REFERENCES public.v21_accounts(id),
 created_at timestamptz DEFAULT now(),
 UNIQUE(member_a,member_b)
);
CREATE TABLE public.v21_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.v21_conversations(id),
 sender_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 client_id text NOT NULL,
 body text NOT NULL,
 created_at timestamptz DEFAULT now(),
 deleted_at timestamptz,
 CONSTRAINT v21_messages_sender_account_id_client_id_key
 UNIQUE(sender_account_id,client_id)
);
CREATE TABLE public.taphoa_orders (id uuid PRIMARY KEY, customer_account_id uuid, status text);
CREATE TABLE public.test_order_snapshots (id uuid PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE public.taphoa_command_log (
 command_id uuid PRIMARY KEY, operation text NOT NULL, result jsonb NOT NULL
);
CREATE TABLE public.test_customer_notices (
 customer_id uuid NOT NULL, command_id text NOT NULL, body text NOT NULL
);

INSERT INTO public.v21_accounts(id,role,contact_group)
VALUES
 ('11111111-1111-4111-8111-111111111111','admin',null),
 ('57fc1306-7030-4955-b174-afffeee2c3d2','user','friend'),
 ('22222222-2222-4222-8222-222222222222','user','customer');
-- Only a real admin session is allowed to emit staff notices in this fixture.
CREATE OR REPLACE FUNCTION public.taphoa_access_context() RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
 SELECT CASE WHEN current_setting('test.admin',true)='yes'
  THEN jsonb_build_object('allowed',true,'taphoa_role','admin',
    'account_id','11111111-1111-4111-8111-111111111111')
  ELSE jsonb_build_object('allowed',false,'taphoa_role','customer',
    'account_id','22222222-2222-4222-8222-222222222222') END;
$$;
CREATE OR REPLACE FUNCTION public.taphoa_chat_qty(n numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT n::text $$;
CREATE OR REPLACE FUNCTION public.taphoa_chat_money(n numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT replace(to_char(coalesce(n,0),'FM999G999G990'),',','.')||'đ' $$;
CREATE OR REPLACE FUNCTION public.taphoa_chat_order_diff(a jsonb,b jsonb,n integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN a->'items' IS DISTINCT FROM b->'items' THEN 'Đổi mặt hàng hoặc SL' ELSE '' END
$$;
CREATE OR REPLACE FUNCTION public.taphoa_chat_notify_customer(
 p_customer_id uuid,p_sender_account_id uuid,p_client_id text,p_body text
) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.test_customer_notices VALUES(p_customer_id,p_client_id,p_body);
 RETURN gen_random_uuid();
END $$;
CREATE OR REPLACE FUNCTION public.taphoa_order_frontend_json(o public.taphoa_orders)
RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT to_jsonb(o) $$;

-- Stable writer shape: same canonical hooks, args and variable names, without
-- production finance logic. This fixture is NOT a replacement business writer.
CREATE OR REPLACE FUNCTION public.taphoa_save_order(p_order jsonb,p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $save$
DECLARE
 v_ctx jsonb:=public.taphoa_access_context();
 v_role text:=coalesce(v_ctx->>'taphoa_role','');
 v_account_id uuid:=nullif(v_ctx->>'account_id','')::uuid;
 v_customer uuid:=nullif(p_order->>'customer_id','')::uuid;
 v_status text:=case when p_order->>'status'='done' then 'delivered' else 'pending' end;
 v_old_status text:='pending';
 v_edit_id uuid:=nullif(p_order->>'edit_order_id','')::uuid;
 v_old_order_json jsonb:=null;
 v_order_json jsonb:=p_order;
 v_result jsonb:=jsonb_build_object('ok',true,'order',p_order);
 v_prior jsonb;
BEGIN
 SELECT result INTO v_prior FROM public.taphoa_command_log WHERE command_id=p_command_id;
 IF FOUND THEN RETURN v_prior; END IF;
 IF v_role<>'admin' THEN RAISE EXCEPTION 'not_admin'; END IF;
 IF v_edit_id IS NULL THEN
  INSERT INTO public.taphoa_orders VALUES ((p_order->>'id')::uuid,v_customer,v_status);
 ELSE
  SELECT payload INTO v_old_order_json FROM public.test_order_snapshots WHERE id=v_edit_id;
  SELECT status INTO v_old_status FROM public.taphoa_orders WHERE id=v_edit_id;
  UPDATE public.taphoa_orders SET status=v_status,customer_account_id=v_customer WHERE id=v_edit_id;
 END IF;
 INSERT INTO public.test_order_snapshots(id,payload) VALUES((p_order->>'id')::uuid,p_order)
 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload;
 if v_role='admin' and v_customer is not null and v_status='delivered' then
  PERFORM public.taphoa_chat_notify_customer(v_customer,v_account_id,
    'taphoa:'||p_command_id::text||':order','delivered');
 end if;
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
 RETURN v_result;
END;
$save$;

CREATE OR REPLACE FUNCTION public.taphoa_deliver_order(p_order_id uuid,p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $deliver$
DECLARE
 ctx jsonb:=public.taphoa_access_context();
 v_order_json jsonb;
 v_result jsonb;
 v_prior jsonb;
BEGIN
 SELECT result INTO v_prior FROM public.taphoa_command_log WHERE command_id=p_command_id;
 IF FOUND THEN RETURN v_prior; END IF;
 SELECT payload INTO v_order_json FROM public.test_order_snapshots WHERE id=p_order_id;
 v_order_json:=jsonb_set(v_order_json,'{status}','"done"');
 UPDATE public.taphoa_orders SET status='delivered' WHERE id=p_order_id;
 UPDATE public.test_order_snapshots SET payload=v_order_json WHERE id=p_order_id;
 PERFORM public.taphoa_order_frontend_json(o) FROM public.taphoa_orders o WHERE id=p_order_id;
 PERFORM public.taphoa_chat_notify_customer(
   nullif(v_order_json->>'customer_id','')::uuid,(ctx->>'account_id')::uuid,
   'taphoa:'||p_command_id::text||':deliver','delivered');
 v_result:=jsonb_build_object('ok',true,'order',v_order_json);
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
 RETURN v_result;
END;
$deliver$;

-- Exact production migration applied without rewriting its SQL for the test.
\i supabase/migrations/20261115143000_taphoa_staff_order_copy_gd_me_yeu.sql

SET test.admin='yes';
-- New pending walk-in: staff receives even without a customer; nobody else.
SELECT public.taphoa_save_order(jsonb_build_object(
  'id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'displayCode','DT501','status','pending','customer_id',null,'tenKH','Khách lẻ',
  'tongTien',25000,'note','',
  'items',jsonb_build_array(jsonb_build_object(
    'product_id','P001','tenSP','Bánh gạo','qty',2,'unit_price',12500,
    'line_no',1,'note','Gói nhỏ'))
), 'aaaa0001-0000-4000-8000-000000000001'::uuid);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.v21_messages)<>1 THEN
  RAISE EXCEPTION 'walk-in draft not copied exactly once to staff'; END IF;
 IF EXISTS(SELECT 1 FROM public.test_customer_notices) THEN
  RAISE EXCEPTION 'walk-in draft leaked a customer message'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.v21_messages m
  JOIN public.v21_conversations c ON c.id=m.conversation_id
  WHERE m.client_id='taphoa:aaaa0001-0000-4000-8000-000000000001:staff-order'
    AND m.body LIKE '%DT501%' AND m.body LIKE '%Bánh gạo%'
    AND m.body LIKE '%25.000%' AND m.body NOT LIKE '%https://%'
    AND (c.member_a='57fc1306-7030-4955-b174-afffeee2c3d2'
      OR c.member_b='57fc1306-7030-4955-b174-afffeee2c3d2')
 ) THEN RAISE EXCEPTION 'staff copy missing order lines/amount or wrong peer'; END IF;
END $$;

-- New command UUID but *same* business data: no-op update stays silent.
SELECT public.taphoa_save_order(jsonb_build_object(
  'id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'edit_order_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'displayCode','DT501','status','pending','customer_id',null,'tenKH','Khách lẻ',
  'tongTien',25000,'note','',
  'items',jsonb_build_array(jsonb_build_object(
    'product_id','P001','tenSP','Bánh gạo','qty',2,'unit_price',12500,
    'line_no',1,'note','Gói nhỏ'))
), 'aaaa0002-0000-4000-8000-000000000002'::uuid);
DO $$
BEGIN IF (SELECT count(*) FROM public.v21_messages)<>1
 THEN RAISE EXCEPTION 'no-op edit notified staff'; END IF; END $$;

-- Meaningful edit with changed quantity/total: exact second internal copy.
SELECT public.taphoa_save_order(jsonb_build_object(
  'id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'edit_order_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'displayCode','DT501','status','pending','customer_id',null,'tenKH','Khách lẻ',
  'tongTien',37500,'note','',
  'items',jsonb_build_array(jsonb_build_object(
    'product_id','P001','tenSP','Bánh gạo','qty',3,'unit_price',12500,
    'line_no',1,'note','Gói nhỏ'))
), 'aaaa0003-0000-4000-8000-000000000003'::uuid);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.v21_messages)<>2 THEN
  RAISE EXCEPTION 'meaningful edit not copied once'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.v21_messages
  WHERE body LIKE '%SỬA ĐƠN%' AND body LIKE '%trước:%') THEN
  RAISE EXCEPTION 'edit summary/delta omitted'; END IF;
END $$;
-- Same command is idempotent via command log; cannot enqueue twice.
SELECT public.taphoa_save_order(
 (SELECT payload||jsonb_build_object(
  'edit_order_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 FROM public.test_order_snapshots
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 'aaaa0003-0000-4000-8000-000000000003'::uuid);
DO $$
BEGIN IF (SELECT count(*) FROM public.v21_messages)<>2
 THEN RAISE EXCEPTION 'retry generated duplicate staff copy'; END IF; END $$;

-- Separate delivered-order writer is also covered.
SELECT public.taphoa_deliver_order(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'aaaa0004-0000-4000-8000-000000000004'::uuid);
DO $$
BEGIN IF (SELECT count(*) FROM public.v21_messages)<>3
 THEN RAISE EXCEPTION 'deliver path missing staff notice'; END IF; END $$;

-- Invalid staff account: no silent replacement, but order save remains valid.
UPDATE public.v21_accounts SET locked_at=now()
WHERE id='57fc1306-7030-4955-b174-afffeee2c3d2';
SELECT public.taphoa_save_order(jsonb_build_object(
  'id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'displayCode','DT502','status','pending','customer_id',null,'tenKH','Khách lẻ',
  'tongTien',0,'note','',
  'items','[]'::jsonb
), 'aaaa0005-0000-4000-8000-000000000005'::uuid);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.v21_messages)<>3 THEN
  RAISE EXCEPTION 'locked staff wrongly received a notice'; END IF;
 IF (SELECT count(*) FROM public.taphoa_command_log)<>5 THEN
  RAISE EXCEPTION 'locked staff blocked business save'; END IF;
END $$;

-- Non-admin cannot invoke helper even with a forged payload.
GRANT USAGE ON SCHEMA v21_private TO authenticated;
SET ROLE authenticated;
SET test.admin='no';
DO $$
BEGIN
 BEGIN
  PERFORM v21_private.taphoa_staff_order_notify(
   '11111111-1111-4111-8111-111111111111',
   'aaaa0010-0000-4000-8000-000000000010',
   '{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'::jsonb);
  RAISE EXCEPTION 'unauthorized client reached staff helper';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.v21_messages)<>3 THEN
  RAISE EXCEPTION 'non-admin emitted staff message'; END IF;
END $$;
\echo 'PASS STAFF-ORDER-014: SQL compile, employee-only target, no customer leak, no-op, edit, retry, delivery, lock, ACL'
