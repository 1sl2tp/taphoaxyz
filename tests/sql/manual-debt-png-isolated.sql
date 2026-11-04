-- SPEC-TAPHOA-MANUAL-DEBT-PNG-20261104
-- Run only against a disposable PostgreSQL 17 database. No production secrets,
-- customer content, real messages, Zalo gateway, Storage API, or network egress.
\set ON_ERROR_STOP on

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA v21_private;
CREATE SCHEMA v21_storage_private;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public,auth,v21_private,v21_storage_private,storage TO authenticated;
GRANT USAGE ON SCHEMA public,auth,v21_storage_private,storage TO anon;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $sql$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  $sql$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

CREATE TABLE public.v21_accounts(
  id uuid PRIMARY KEY,
  auth_user_id uuid,
  role text NOT NULL,
  contact_group text,
  deleted_at timestamptz,
  locked_at timestamptz
);
CREATE TABLE public.v21_conversations(
  id uuid PRIMARY KEY,
  member_a uuid NOT NULL REFERENCES public.v21_accounts(id),
  member_b uuid NOT NULL REFERENCES public.v21_accounts(id)
);
CREATE TABLE public.v21_messages(
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.v21_conversations(id),
  sender_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE public.v21_media_assets(
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.v21_conversations(id),
  message_id uuid REFERENCES public.v21_messages(id),
  owner_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  kind text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_key text,
  width_px integer,
  height_px integer,
  sort_index integer DEFAULT 0,
  deleted_at timestamptz
);
CREATE TABLE storage.objects(
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text,
  metadata jsonb,
  archived_at timestamptz,
  is_delete_marker boolean NOT NULL DEFAULT false,
  PRIMARY KEY(bucket_id,name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON storage.objects TO authenticated;

-- Emulates the production access-context interface, not an actual login.
CREATE OR REPLACE FUNCTION public.taphoa_access_context() RETURNS jsonb
LANGUAGE sql STABLE AS $sql$
SELECT CASE WHEN auth.uid()='11111111-1111-4111-8111-111111111111'::uuid THEN
 jsonb_build_object('allowed',true,'taphoa_role','admin',
  'account_id','22222222-2222-4222-8222-222222222222')
 ELSE jsonb_build_object('allowed',false,'taphoa_role','user',
  'account_id','33333333-3333-4333-8333-333333333333')
 END;
$sql$;
GRANT EXECUTE ON FUNCTION public.taphoa_access_context() TO authenticated;

INSERT INTO public.v21_accounts(id,auth_user_id,role,contact_group)
VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','admin',null),
 ('33333333-3333-4333-8333-333333333333','99999999-9999-4999-8999-999999999999','user','customer'),
 ('44444444-4444-4444-8444-444444444444',null,'user','customer');
INSERT INTO public.v21_conversations(id,member_a,member_b)
VALUES ('55555555-5555-4555-8555-555555555555',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333');
INSERT INTO public.v21_messages(id,conversation_id,sender_account_id,client_id)
VALUES ('66666666-6666-4666-8666-666666666666',
 '55555555-5555-4555-8555-555555555555',
 '22222222-2222-4222-8222-222222222222',
 'manual:debt:77777777-7777-4777-8777-777777777777');

-- Execute the ACTUAL production migration file without editing a copy.
\i supabase/migrations/20261104093000_taphoa_manual_debt_image_handoff.sql

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';

-- Cross-recipient ticket must not be created.
DO $$
DECLARE v jsonb;
BEGIN
  v:=public.taphoa_manual_debt_image_ticket(
    '44444444-4444-4444-8444-444444444444',
    '77777777-7777-4777-8777-777777777777'
  );
  IF v->>'reason' IS DISTINCT FROM 'manual_notice_not_found_or_expired' THEN
    RAISE EXCEPTION 'wrong-customer image ticket allowed: %',v;
  END IF;
END $$;

-- Ticket must identify exactly one existing, correct Chat message.
SELECT (v->>'asset_id') AS png_asset,
       (v->>'storage_key') AS png_key,
       (v->>'message_id') AS png_message
FROM (
 SELECT public.taphoa_manual_debt_image_ticket(
   '33333333-3333-4333-8333-333333333333',
   '77777777-7777-4777-8777-777777777777') AS v
) t
\gset
SET test.png_asset = :'png_asset';
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.taphoa_manual_debt_image_ticket(
   '33333333-3333-4333-8333-333333333333',
   '77777777-7777-4777-8777-777777777777');
 IF v->>'message_id' IS DISTINCT FROM '66666666-6666-4666-8666-666666666666'
    OR v->>'asset_id' IS DISTINCT FROM current_setting('test.png_asset') THEN
  RAISE EXCEPTION 'ticket not idempotent: %',v;
 END IF;
END $$;

-- Forged Storage upload prior to the authorized owner, or wrong key, is denied.
SET request.jwt.claim.sub='99999999-9999-4999-8999-999999999999';
DO $$
BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
  VALUES('v21-media','22222222-2222-4222-8222-222222222222/forged',
    '99999999-9999-4999-8999-999999999999','{"mimetype":"image/png","size":321}');
  RAISE EXCEPTION 'wrong owner inserted Storage object unexpectedly';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
-- Attachment without a file must fail closed, not create a media row.
DO $$
BEGIN
 PERFORM public.taphoa_manual_debt_image_attach(
  '77777777-7777-4777-8777-777777777777',
  current_setting('test.png_asset')::uuid,321,700,1250);
 RAISE EXCEPTION 'attachment without Storage was accepted';
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'image_storage_missing_or_invalid' THEN RAISE; END IF;
END $$;

INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES('v21-media',:'png_key','11111111-1111-4111-8111-111111111111',
  '{"mimetype":"image/png","size":321}'::jsonb);

-- MIME, size and requested asset ID must be server-verified.
DO $$
BEGIN
 PERFORM public.taphoa_manual_debt_image_attach(
   '77777777-7777-4777-8777-777777777777',current_setting('test.png_asset')::uuid,
   322,700,1250);
 RAISE EXCEPTION 'wrong PNG bytes were accepted';
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'image_storage_missing_or_invalid' THEN RAISE; END IF;
END $$;

SELECT (public.taphoa_manual_debt_image_attach(
 '77777777-7777-4777-8777-777777777777',:'png_asset'::uuid,
 321,700,1250)->>'ok') AS png_attached
\gset
\if :png_attached
\else
  \echo 'FAIL: canonical media asset not attached'
  \quit 1
\endif

SELECT (public.taphoa_manual_debt_image_ticket(
 '33333333-3333-4333-8333-333333333333',
 '77777777-7777-4777-8777-777777777777')->>'already_attached') AS png_idempotent
\gset
\if :png_idempotent
\else
  \echo 'FAIL: already-attached ticket not recognized'
  \quit 1
\endif

RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.v21_media_assets)<>1 THEN
   RAISE EXCEPTION 'duplicate or missing canonical PNG asset';
 END IF;
 IF (SELECT count(*) FROM v21_private.taphoa_manual_debt_image_uploads WHERE attached_at IS NOT NULL)<>1 THEN
   RAISE EXCEPTION 'ticket not finalized';
 END IF;
END $$;

-- A detached/archived object must never continue producing positive ACKs.
UPDATE storage.objects SET is_delete_marker=true WHERE name=:'png_key';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$
DECLARE v jsonb;
BEGIN
  v:=public.taphoa_manual_debt_image_ticket(
   '33333333-3333-4333-8333-333333333333',
   '77777777-7777-4777-8777-777777777777');
  IF v->>'reason' IS DISTINCT FROM 'attached_asset_missing' THEN
    RAISE EXCEPTION 'deleted Storage file falsely acknowledged: %',v;
  END IF;
END $$;

\echo 'PASS: disposable PostgreSQL migration, RLS, exact-recipient, media-ACK and idempotency'
