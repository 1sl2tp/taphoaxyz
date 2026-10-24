-- CYCLE-197b: resolve respectful pronouns consistently, and hold ANY
-- unresolved customer bank bill until Admin finishes reconciliation.
CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_address(p_name text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE v text:=btrim(coalesce(p_name,'')); v_rest text; v_role text;
BEGIN
  IF v ~* '^(cô|chú|bác)([[:space:]]|$)' THEN
    v_role:=lower(split_part(v,' ',1));
    RETURN jsonb_build_object('name',v,'speaker','cháu','vocative',v_role);
  END IF;
  IF v ~* '^(A|C|E)[[:space:]]+' THEN
    v_rest:=btrim(substring(v from 2));
    IF upper(left(v,1))='A' THEN v_role:='Anh';
    ELSIF upper(left(v,1))='C' THEN v_role:='Chị';
    ELSE v_role:='Em'; END IF;
    RETURN jsonb_build_object('name',v_role||' '||v_rest,
      'speaker',CASE WHEN v_role='Em' THEN 'chị' ELSE 'em' END,
      'vocative',lower(v_role));
  END IF;
  IF v ~* '^(anh|chị|em)([[:space:]]|$)' THEN
    v_role:=lower(split_part(v,' ',1));
    RETURN jsonb_build_object('name',v,
      'speaker',CASE WHEN v_role='em' THEN 'chị' ELSE 'em' END,
      'vocative',v_role);
  END IF;
  RETURN jsonb_build_object('name',coalesce(nullif(v,''),'Anh/chị'),
    'speaker','em','vocative','anh/chị');
END; $$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_address(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_cycle_payment_pending(p_customer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.chat_bank_bill_receipts r
  WHERE r.customer_account_id=p_customer AND r.ledger_id IS NULL
    AND r.status IN ('amount_read','review')
 );
$$;
REVOKE ALL ON FUNCTION v21_private.taphoa_cycle_payment_pending(uuid) FROM PUBLIC,anon,authenticated;

-- Fix the closing pronoun of already-installed notification functions.
DO $$
DECLARE s text;
BEGIN
 s:=pg_get_functiondef('v21_private.taphoa_cycle_send_due_notices()'::regprocedure);
 IF position('Cảm ơn mình ạ!' IN s)>0 THEN
  EXECUTE replace(s,
    '||'' đối chiếu, tránh nhắc nhầm. Cảm ơn mình ạ!'';',
    '||'' đối chiếu, tránh nhắc nhầm. Cảm ơn ''||(addr->>''vocative'')||'' ạ!'';');
 END IF;
 s:=pg_get_functiondef('v21_private.taphoa_cycle_send_pre_due_notices()'::regprocedure);
 IF position('||''Cảm ơn ''||(addr->>''name'')||'' ạ!''' IN s)>0 THEN
  EXECUTE replace(s,'||''Cảm ơn ''||(addr->>''name'')||'' ạ!'';',
    '||''Cảm ơn ''||(addr->>''vocative'')||'' ạ!'';');
 END IF;
END;
$$;
