-- ADMIN-CP-002: list customers already assigned product-specific prices.
-- Read-only aggregation; preserves original admin-only RPC contract.
BEGIN;
CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_special_price_customers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE ctx jsonb:=public.taphoa_access_context(); result jsonb;
BEGIN
  IF NOT coalesce((ctx->>'allowed')::boolean,false) OR ctx->>'taphoa_role'<>'admin'
    THEN RAISE EXCEPTION 'taphoa_access_denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,
      'name',coalesce(nullif(btrim(a.display_name),''),a.username),
      'price_count',coalesce(pr.price_count,0))
    ORDER BY
      (coalesce(pr.price_count,0)>0) DESC,
      pr.latest_at DESC NULLS LAST,
      lower(coalesce(nullif(btrim(a.display_name),''),a.username)),
      a.id
  ),'[]'::jsonb)
  INTO result
  FROM public.v21_accounts a
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS price_count, max(s.updated_at) AS latest_at
    FROM public.taphoa_customer_special_prices s
    WHERE s.customer_id=a.id
  ) pr ON true
  WHERE a.role='user' AND a.contact_group='customer'
    AND a.deleted_at IS NULL AND a.locked_at IS NULL;
  RETURN result;
END;
$body$;
REVOKE ALL ON FUNCTION public.taphoa_admin_customer_special_price_customers() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_admin_customer_special_price_customers() TO authenticated;
COMMIT;
