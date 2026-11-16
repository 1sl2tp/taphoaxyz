-- SPEC-ADMIN-CP-001: per-customer / per-product overrides.
-- MIGRATION ONLY. Do not apply to production database without the
-- approved controlled migration process and end-to-end order-price checks.
-- This backend intentionally does not yet change customer quotes or order totals.
BEGIN;
CREATE TABLE IF NOT EXISTS public.taphoa_customer_special_prices (
  customer_id uuid NOT NULL REFERENCES public.v21_accounts(id) ON DELETE CASCADE,
  product_code text NOT NULL REFERENCES public.taphoa_products(product_code) ON DELETE CASCADE,
  price_vnd numeric(18,2) NOT NULL CHECK (price_vnd>0 AND price_vnd<=1000000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id uuid REFERENCES public.v21_accounts(id),
  PRIMARY KEY (customer_id, product_code)
);
ALTER TABLE public.taphoa_customer_special_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taphoa_customer_special_prices FROM PUBLIC,anon,authenticated;
-- The table is private to the Admin RPC; intentionally NO generic RLS policies.

CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_special_price_customers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE ctx jsonb:=public.taphoa_access_context(); result jsonb;
BEGIN
  IF NOT coalesce((ctx->>'allowed')::boolean,false) OR ctx->>'taphoa_role'<>'admin'
    THEN RAISE EXCEPTION 'taphoa_access_denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',
    coalesce(nullif(btrim(a.display_name),''),a.username))
    ORDER BY lower(coalesce(nullif(btrim(a.display_name),''),a.username)),a.id),'[]'::jsonb)
  INTO result FROM public.v21_accounts a
  WHERE a.role='user' AND a.contact_group='customer'
    AND a.deleted_at IS NULL AND a.locked_at IS NULL;
  RETURN result;
END;
$body$;

CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_special_price_matrix(
  p_customer_ids uuid[],p_product_codes text[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE ctx jsonb:=public.taphoa_access_context(); result jsonb;
BEGIN
  IF NOT coalesce((ctx->>'allowed')::boolean,false) OR ctx->>'taphoa_role'<>'admin'
    THEN RAISE EXCEPTION 'taphoa_access_denied' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(p_customer_ids,1),0)>8
    OR coalesce(array_length(p_product_codes,1),0)>200
    THEN RAISE EXCEPTION 'too_many_price_cells' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'customer_id',s.customer_id,'product_code',s.product_code,'price',s.price_vnd
  ) ORDER BY s.customer_id,s.product_code),'[]'::jsonb)
  INTO result FROM public.taphoa_customer_special_prices s
  WHERE s.customer_id=ANY(coalesce(p_customer_ids,array[]::uuid[]))
    AND s.product_code=ANY(coalesce(p_product_codes,array[]::text[]));
  RETURN result;
END;
$body$;

CREATE OR REPLACE FUNCTION public.taphoa_admin_customer_special_price_set(
  p_customer_id uuid,p_product_code text,p_price numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE ctx jsonb:=public.taphoa_access_context();
        v_actor uuid:=nullif(ctx->>'account_id','')::uuid;
        v_product public.taphoa_products;
        v_code text:=upper(btrim(coalesce(p_product_code,'')));
BEGIN
  IF NOT coalesce((ctx->>'allowed')::boolean,false) OR ctx->>'taphoa_role'<>'admin'
    THEN RAISE EXCEPTION 'taphoa_access_denied' USING ERRCODE='42501'; END IF;
  IF p_customer_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.v21_accounts a WHERE a.id=p_customer_id
      AND a.role='user' AND a.contact_group='customer'
      AND a.deleted_at IS NULL AND a.locked_at IS NULL
  ) THEN RAISE EXCEPTION 'customer_not_found' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_product FROM public.taphoa_products p
  WHERE p.product_code=v_code AND p.sync_status<>'deleted'
    AND p.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found' USING ERRCODE='22023'; END IF;
  IF p_price IS NOT NULL AND
     (p_price<=0 OR p_price>1000000000 OR v_product.input_price_vnd IS NULL
      OR v_product.input_price_vnd<=0)
  THEN RAISE EXCEPTION 'invalid_customer_price' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-special-price:'||p_customer_id::text||':'||v_code,0));
  IF p_price IS NULL THEN
    DELETE FROM public.taphoa_customer_special_prices s
    WHERE s.customer_id=p_customer_id AND s.product_code=v_code;
  ELSE
    INSERT INTO public.taphoa_customer_special_prices(
      customer_id,product_code,price_vnd,updated_at,updated_by_account_id
    ) VALUES (p_customer_id,v_code,p_price,now(),v_actor)
    ON CONFLICT (customer_id,product_code)
    DO UPDATE SET price_vnd=EXCLUDED.price_vnd,
      updated_at=EXCLUDED.updated_at,updated_by_account_id=EXCLUDED.updated_by_account_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'customer_id',p_customer_id,
    'product_code',v_code,'price',p_price);
END;
$body$;
REVOKE ALL ON FUNCTION public.taphoa_admin_customer_special_price_customers() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.taphoa_admin_customer_special_price_matrix(uuid[],text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.taphoa_admin_customer_special_price_set(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_admin_customer_special_price_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_admin_customer_special_price_matrix(uuid[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_admin_customer_special_price_set(uuid,text,numeric) TO authenticated;
COMMIT;
