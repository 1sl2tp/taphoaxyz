-- CYCLE-198: Operator voice is independent of the customer's title.
-- There is one shared Hỗ trợ admin identity, so do NOT infer the real sender's gender.
-- Defaults to a male voice (anh/em/cháu), explicitly switchable to female (chị/em/cháu).
CREATE TABLE IF NOT EXISTS v21_private.taphoa_cycle_sender_voice (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 young_customer_speaker text NOT NULL DEFAULT 'anh'
   CHECK (young_customer_speaker IN ('anh','chị')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid
);
REVOKE ALL ON v21_private.taphoa_cycle_sender_voice FROM PUBLIC,anon,authenticated;
INSERT INTO v21_private.taphoa_cycle_sender_voice(singleton,young_customer_speaker)
VALUES(true,'anh') ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_address(p_name text)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,v21_private,pg_temp AS $function$
DECLARE
 v text:=btrim(coalesce(p_name,'')); v_rest text;
 v_title text; v_young text:='anh'; v_speaker text;
BEGIN
 SELECT coalesce(young_customer_speaker,'anh') INTO v_young
 FROM v21_private.taphoa_cycle_sender_voice WHERE singleton=true;
 v_young:=coalesce(v_young,'anh');
 IF v ~* '^(cô|chú|bác)([[:space:]]|$)' THEN
   v_title:=lower(split_part(v,' ',1));
   RETURN jsonb_build_object('name',v,'speaker','cháu','vocative',v_title);
 END IF;
 IF v ~* '^(A|C|E)[[:space:]]+' THEN
   v_rest:=btrim(substring(v from 2));
   v_title:=CASE upper(left(v,1)) WHEN 'A' THEN 'Anh'
     WHEN 'C' THEN 'Chị' ELSE 'Em' END;
   v_speaker:=CASE WHEN v_title='Em' THEN v_young ELSE 'em' END;
   RETURN jsonb_build_object('name',v_title||' '||v_rest,
     'speaker',v_speaker,'vocative',lower(v_title));
 END IF;
 IF v ~* '^(anh|chị|em)([[:space:]]|$)' THEN
   v_title:=lower(split_part(v,' ',1));
   v_speaker:=CASE WHEN v_title='em' THEN v_young ELSE 'em' END;
   RETURN jsonb_build_object('name',v,'speaker',v_speaker,'vocative',v_title);
 END IF;
 RETURN jsonb_build_object('name',coalesce(nullif(v,''),'Anh/chị'),
    'speaker','em','vocative','anh/chị');
END; $function$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_address(text)
 FROM PUBLIC,anon,authenticated;

-- Read or update default voice from the native Admin care screen.
-- Not a permission for ordinary customer accounts.
CREATE OR REPLACE FUNCTION public.taphoa_cycle_sender_voice_setting(
 p_voice text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $function$
DECLARE v_ctx jsonb; v_current text; v_updater uuid;
BEGIN
 v_ctx:=public.taphoa_access_context();
 IF coalesce((v_ctx->>'allowed')::boolean,false) IS NOT TRUE
    OR v_ctx->>'taphoa_role' IS DISTINCT FROM 'admin'
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_voice IS NOT NULL THEN
   IF p_voice NOT IN ('anh','chị') THEN
      RAISE EXCEPTION 'voice_must_be_anh_or_chi'; END IF;
   v_updater:=nullif(v_ctx->>'account_id','')::uuid;
   UPDATE v21_private.taphoa_cycle_sender_voice
     SET young_customer_speaker=p_voice,updated_at=clock_timestamp(),
         updated_by=v_updater
     WHERE singleton=true;
 END IF;
 SELECT young_customer_speaker INTO v_current FROM v21_private.taphoa_cycle_sender_voice
 WHERE singleton=true;
 RETURN jsonb_build_object('young_speaker',coalesce(v_current,'anh'),
   'role','admin','automatic_reminder_voice',true);
END; $function$;
REVOKE ALL ON FUNCTION public.taphoa_cycle_sender_voice_setting(text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_cycle_sender_voice_setting(text) TO authenticated;
