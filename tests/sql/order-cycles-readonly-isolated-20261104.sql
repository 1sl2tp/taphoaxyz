-- SPEC-ORDER-CYCLES-READONLY-20261104: disposable PostgreSQL only.
-- No production secrets, account data, money writes, Zalo or schedulers.
\set ON_ERROR_STOP on
DO $role$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
END;
$role$;

CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;
CREATE TABLE public.v21_accounts(
 id uuid PRIMARY KEY, role text, contact_group text,
 deleted_at timestamptz,locked_at timestamptz
);
CREATE TABLE public.taphoa_orders(
 id uuid PRIMARY KEY,
 customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 status text NOT NULL,
 created_at timestamptz NOT NULL,
 delivered_at timestamptz
);
CREATE TABLE public.taphoa_debt_ledger(
 id bigint PRIMARY KEY,
 customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 created_at timestamptz NOT NULL,order_id uuid,
 entry_type text NOT NULL,amount_vnd numeric NOT NULL
);

CREATE OR REPLACE FUNCTION public.taphoa_access_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
 SELECT CASE
  WHEN auth.uid()='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN
   jsonb_build_object('allowed',true,'taphoa_role','admin',
     'account_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  WHEN auth.uid()='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid THEN
   jsonb_build_object('allowed',true,'taphoa_role','user',
     'account_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  WHEN auth.uid()='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN
   jsonb_build_object('allowed',true,'taphoa_role','user',
     'account_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  ELSE jsonb_build_object('allowed',false,'taphoa_role','')
 END;
$fn$;

INSERT INTO public.v21_accounts(id,role,contact_group) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user','customer'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','user','customer');

INSERT INTO public.taphoa_orders(id,customer_account_id,status,created_at,delivered_at) VALUES
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered','2026-10-03 02:00+00','2026-10-03 02:00+00'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered','2026-10-03 03:00+00','2026-10-03 03:00+00'),
 ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','delivered','2026-10-05 02:00+00','2026-10-05 02:00+00'),
 ('44444444-4444-4444-8444-444444444444','cccccccc-cccc-4ccc-8ccc-cccccccccccc','delivered','2026-10-03 02:00+00','2026-10-03 02:00+00'),
 ('55555555-5555-4555-8555-555555555555','cccccccc-cccc-4ccc-8ccc-cccccccccccc','delivered','2026-10-06 02:00+00','2026-10-06 02:00+00');

-- B: two orders on D1 plus another on D3, collection PARTIAL only.
-- C: paid in full. A later new order will open a fresh debt period.
INSERT INTO public.taphoa_debt_ledger(id,customer_account_id,created_at,order_id,entry_type,amount_vnd) VALUES
 (1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-10-03 02:01+00','11111111-1111-4111-8111-111111111111','sale',100),
 (2,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-10-03 03:01+00','22222222-2222-4222-8222-222222222222','sale',200),
 (3,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-10-05 02:01+00','33333333-3333-4333-8333-333333333333','sale',300),
 (4,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-10-05 04:00+00',null,'collection',-100),
 (5,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-03 02:01+00','44444444-4444-4444-8444-444444444444','sale',100),
 (6,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-04 05:00+00',null,'collection',-100);

\i supabase/migrations/20261104211500_taphoa_order_cycles_readonly_admin_user.sql
\i supabase/migrations/20261104215000_taphoa_order_cycles_progress_amount_readonly.sql

SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $cycle_test$
DECLARE v jsonb; x jsonb;
BEGIN
 v:=public.taphoa_order_cycles_view();
 IF jsonb_array_length(v)<>1 THEN RAISE EXCEPTION 'User leaked other customers: %',v; END IF;
 x:=v->0;
 IF x->>'customerId' IS DISTINCT FROM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  OR (x->>'isOpen')::boolean IS DISTINCT FROM true
  OR (x->>'orderCount')::int<>3
  OR (x->>'activePeriodNo')::int<>1
  OR (x->>'balanceThousands')::numeric<>500
  OR x->>'earliestDueDay' IS DISTINCT FROM '2026-10-09'
  OR x->>'lastPurchaseDay' IS DISTINCT FROM '2026-10-05'
  OR x->>'idleReviewDay' IS DISTINCT FROM '2026-10-08'
 THEN RAISE EXCEPTION 'User order clock mismatch: %',x; END IF;
 IF x#>>'{orderCycles,0,dueDay}' IS DISTINCT FROM '2026-10-09'
  OR x#>>'{orderCycles,1,dueDay}' IS DISTINCT FROM '2026-10-09'
  OR x#>>'{orderCycles,2,dueDay}' IS DISTINCT FROM '2026-10-11'
 THEN RAISE EXCEPTION 'D7 per order not independent: %',x; END IF;
 IF (x#>>'{orderCycles,0,amountThousands}')::numeric<>100
  OR (x#>>'{orderCycles,1,amountThousands}')::numeric<>200
  OR (x#>>'{orderCycles,2,amountThousands}')::numeric<>300
  OR (x#>>'{orderCycles,0,estimatedRemainingThousands}')::numeric<>0
  OR (x#>>'{orderCycles,1,estimatedRemainingThousands}')::numeric<>200
  OR (x#>>'{orderCycles,2,estimatedRemainingThousands}')::numeric<>300
  OR (x#>>'{orderCycles,0,progressDays}')::int<>7
 THEN RAISE EXCEPTION 'FIFO partial-payment projection or progress mismatch: %',x; END IF;
END;
$cycle_test$;

SET request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $cycle_test$
DECLARE v jsonb; x jsonb;
BEGIN
 v:=public.taphoa_order_cycles_view();x:=v->0;
 IF jsonb_array_length(v)<>1
  OR x->>'customerId' IS DISTINCT FROM 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  OR (x->>'isOpen')::boolean IS DISTINCT FROM false
  OR jsonb_array_length(x->'orderCycles')<>0
 THEN RAISE EXCEPTION 'Paid customer must reset all active order cycles: %',v; END IF;
END;
$cycle_test$;

SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $cycle_test$
DECLARE v jsonb;
BEGIN
 v:=public.taphoa_order_cycles_view();
 IF jsonb_array_length(v)<>2 THEN RAISE EXCEPTION 'Admin not seeing customer list: %',v; END IF;
END;
$cycle_test$;

SET request.jwt.claim.sub='99999999-9999-4999-8999-999999999999';
DO $cycle_test$
BEGIN
 PERFORM public.taphoa_order_cycles_view();
 RAISE EXCEPTION 'Unknown account was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$cycle_test$;

RESET ROLE;
INSERT INTO public.taphoa_debt_ledger(id,customer_account_id,created_at,order_id,entry_type,amount_vnd)
VALUES(7,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-10-06 02:01+00','55555555-5555-4555-8555-555555555555','sale',400);
SET ROLE authenticated;
SET request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $cycle_test$
DECLARE x jsonb;
BEGIN
 x:=public.taphoa_order_cycles_view()->0;
 IF (x->>'activePeriodNo')::int<>2
  OR (x->>'orderCount')::int<>1
  OR x#>>'{orderCycles,0,number}' IS DISTINCT FROM '1'
  OR x#>>'{orderCycles,0,dueDay}' IS DISTINCT FROM '2026-10-12'
  OR (x#>>'{orderCycles,0,estimatedRemainingThousands}')::numeric<>400
 THEN RAISE EXCEPTION 'New debt period failed to reset order sequence: %',x; END IF;
END;
$cycle_test$;
RESET ROLE;
DO $cycle_test$
BEGIN
 IF (SELECT count(*) FROM public.taphoa_debt_ledger)<>7 THEN
   RAISE EXCEPTION 'Read-only RPC mutated monetary ledger';
 END IF;
END;
$cycle_test$;

\echo 'PASS: per-order D7, newest-first UI source, FIFO partial estimate and Admin/User scope'
