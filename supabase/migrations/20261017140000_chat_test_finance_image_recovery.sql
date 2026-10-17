-- Limited UI-initiated repair of recently sent test-customer finance notices.
-- No payment, ledger, new message, cron, or poll is created. Admin only.
CREATE OR REPLACE FUNCTION public.taphoa_test_finance_unattached_notices(
 p_customer_id uuid,p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp AS $f$
DECLARE
 v_ctx jsonb:=public.taphoa_access_context();
 v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
 v_records jsonb;
BEGIN
 IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin'
    OR auth.uid() IS NULL OR v_sender IS NULL
 THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.v21_accounts a WHERE a.id=p_customer_id
   AND a.username='test' AND a.role='user' AND a.contact_group='customer'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RETURN '[]'::jsonb; END IF;
 WITH pending AS (
  SELECT cmd.result || jsonb_build_object('notice_command_id',cmd.command_id) receipt,
         cmd.created_at
  FROM public.taphoa_command_log cmd
  WHERE cmd.operation='debt_transaction'
    AND cmd.result->>'customer_id'=p_customer_id::text
    AND cmd.result->>'notice_sent'='true'
    AND cmd.result->>'receipt_kind' IN ('collection','payment')
    AND cmd.created_at>=now()-interval '18 minutes'
    AND EXISTS (
      SELECT 1 FROM public.v21_messages m
      JOIN public.v21_conversations c ON c.id=m.conversation_id
      WHERE m.client_id=('taphoa:'||cmd.command_id::text||':'||
       CASE WHEN cmd.result->>'receipt_kind'='collection' THEN 'collection' ELSE 'debt' END)
       AND m.sender_account_id=v_sender AND m.deleted_at IS NULL
       AND (c.member_a=p_customer_id OR c.member_b=p_customer_id)
       AND NOT EXISTS (
        SELECT 1 FROM public.v21_media_assets asset
        WHERE asset.message_id=m.id AND asset.kind='image' AND asset.deleted_at IS NULL
       )
       AND v21_private.chat_outbound_allowed(p_customer_id,m.client_id)
    )
  ORDER BY cmd.created_at DESC LIMIT LEAST(GREATEST(coalesce(p_limit,3),1),3)
 )
 SELECT coalesce(jsonb_agg(receipt ORDER BY created_at),'[]'::jsonb)
 INTO v_records FROM pending;
 RETURN v_records;
END;
$f$;
REVOKE ALL ON FUNCTION public.taphoa_test_finance_unattached_notices(uuid,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_test_finance_unattached_notices(uuid,integer) TO authenticated;
