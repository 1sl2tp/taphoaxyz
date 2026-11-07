-- SPEC-PRICE-NO-COST-20261108
-- A valid selling price requires input_price_vnd > 0.
-- Guard every price basis, including NPP, tobacco reference and retail override.
-- Applies only to current product prices; never rewrites old order cost snapshots.
BEGIN;

CREATE OR REPLACE FUNCTION public.taphoa_product_sale_price(
  p_cost numeric,
  p_supplier numeric,
  p_basis text,
  p_source_key text,
  p_old_profit numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_cost IS NULL OR p_cost<=0 THEN NULL
    WHEN p_basis='supplier_1' AND p_supplier IS NOT NULL THEN p_supplier
    WHEN p_basis='supplier_1_5' AND p_supplier IS NOT NULL THEN ceil(p_supplier*1.015)
    WHEN p_basis='supplier_3' AND p_supplier IS NOT NULL THEN ceil(p_supplier*1.03)
    WHEN p_basis='cost_1_5' THEN ceil(p_cost*1.015)
    WHEN p_basis='cost_3' THEN ceil(p_cost*1.03)
    ELSE public.taphoa_cost_target_sale(p_cost,p_source_key,p_old_profit)
  END;
$function$;

-- Older callers must obey the same invariant instead of pricing from NPP.
CREATE OR REPLACE FUNCTION public.taphoa_auto_sale_price(
  p_cost numeric,
  p_supplier numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_cost IS NULL OR p_cost<=0 THEN NULL
    WHEN p_supplier IS NULL THEN ceil(p_cost*1.015)
    WHEN p_supplier>=p_cost THEN p_supplier
    ELSE greatest(ceil(p_supplier*1.015),ceil(p_cost*1.015))
  END;
$function$;

-- Enforce stored prices regardless of the writer (admin, import, sync, RPC).
-- Never erase supplier/reference configuration or retail-price override; those
-- inputs can become effective again after a valid cost is supplied.
CREATE OR REPLACE FUNCTION public.taphoa_clear_sale_without_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sync_status IS DISTINCT FROM 'deleted'
     AND (NEW.input_price_vnd IS NULL OR NEW.input_price_vnd<=0) THEN
    NEW.sale_price_vnd := NULL;
    NEW.carton_price_vnd := NULL;
    NEW.retail_price_vnd := NULL;
    NEW.applied_profit_vnd := 0;
    NEW.stock_status := CASE
      WHEN NEW.admin_state='discontinued' THEN 'out_of_stock'
      ELSE 'no_price'
    END;
    NEW.stock_label := CASE
      WHEN NEW.admin_state='hidden' THEN 'Ẩn'
      WHEN NEW.admin_state='discontinued' THEN 'Ngừng bán'
      ELSE 'Chưa có giá'
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS taphoa_products_clear_sale_without_cost ON public.taphoa_products;
CREATE TRIGGER taphoa_products_clear_sale_without_cost
BEFORE INSERT OR UPDATE ON public.taphoa_products
FOR EACH ROW
EXECUTE FUNCTION public.taphoa_clear_sale_without_cost();

-- One-time repair of only affected CURRENT prices (e.g. TL dứa shown at 1.000đ
-- despite a recorded cost of zero). Do not mutate sales, debt or past invoices.
DO $repair$
DECLARE
  v_repaired integer := 0;
BEGIN
  UPDATE public.taphoa_products p
  SET sale_price_vnd=NULL,
      carton_price_vnd=NULL,
      retail_price_vnd=NULL,
      applied_profit_vnd=0,
      stock_status=CASE
        WHEN p.admin_state='discontinued' THEN 'out_of_stock'
        ELSE 'no_price'
      END,
      stock_label=CASE
        WHEN p.admin_state='hidden' THEN 'Ẩn'
        WHEN p.admin_state='discontinued' THEN 'Ngừng bán'
        ELSE 'Chưa có giá'
      END,
      updated_at=now()
  WHERE p.sync_status IS DISTINCT FROM 'deleted'
    AND (p.input_price_vnd IS NULL OR p.input_price_vnd<=0)
    AND (
      p.sale_price_vnd IS NOT NULL
      OR p.carton_price_vnd IS NOT NULL
      OR p.retail_price_vnd IS NOT NULL
      OR coalesce(p.applied_profit_vnd,0)<>0
      OR p.stock_status IS DISTINCT FROM CASE WHEN p.admin_state='discontinued' THEN 'out_of_stock' ELSE 'no_price' END
      OR p.stock_label IS DISTINCT FROM CASE
        WHEN p.admin_state='hidden' THEN 'Ẩn'
        WHEN p.admin_state='discontinued' THEN 'Ngừng bán'
        ELSE 'Chưa có giá'
      END
    );
  GET DIAGNOSTICS v_repaired = ROW_COUNT;
  IF v_repaired>0 THEN
    UPDATE public.taphoa_revisions
    SET revision=revision+1,updated_at=now()
    WHERE domain='products';
  END IF;
END;
$repair$;

COMMIT;
