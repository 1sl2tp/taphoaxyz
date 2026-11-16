-- SPEC-SPLIT-PENDING-20261116
-- Source migration only: applying in production requires controlled release.
-- One PostgreSQL transaction moves selected whole lines into a new DT/DG.
-- Any failure rolls back both the remainder edit and the new order/ledger/notice.
CREATE OR REPLACE FUNCTION public.taphoa_split_pending_order(
  p_order_id uuid, p_selected_codes text[], p_expected_items jsonb,
  p_target_status text, p_command_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','auth'
AS $$
DECLARE
  v_ctx jsonb := public.taphoa_access_context();
  v_source public.taphoa_orders;
  v_old_code text;
  v_prior jsonb;
  v_result jsonb;
  v_remaining jsonb;
  v_selected jsonb;
  v_saved_compare jsonb;
  v_expected_compare jsonb;
  v_cost_snapshots jsonb;
  v_line_count integer;
  v_selected_count integer;
  v_target_status text := lower(coalesce(p_target_status,''));
  v_source_result jsonb;
  v_child_result jsonb;
  v_child_id uuid;
  v_source_command uuid := gen_random_uuid();
  v_child_command uuid := gen_random_uuid();
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin' THEN
    RAISE EXCEPTION 'taphoa_access_denied' USING errcode='42501';
  END IF;
  IF p_order_id IS NULL OR p_command_id IS NULL THEN
    RAISE EXCEPTION 'order_id_and_command_id_required';
  END IF;
  IF v_target_status NOT IN ('pending','delivered') THEN
    RAISE EXCEPTION 'invalid_split_target';
  END IF;
  IF p_expected_items IS NULL OR jsonb_typeof(p_expected_items)<>'array' THEN
    RAISE EXCEPTION 'invalid_expected_items';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  SELECT result INTO v_prior FROM public.taphoa_command_log
    WHERE command_id=p_command_id;
  IF FOUND THEN RETURN v_prior; END IF;

  SELECT * INTO v_source FROM public.taphoa_orders
    WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_source.status<>'pending' THEN
    RAISE EXCEPTION 'split_pending_only';
  END IF;

  SELECT count(*),
         coalesce(jsonb_agg(
           jsonb_build_array(i.line_no,i.product_code,i.qty,i.unit_price_vnd,
                             coalesce(i.note,''))
           ORDER BY i.line_no,i.product_code),'[]'::jsonb),
         coalesce(jsonb_object_agg(i.product_code,i.unit_cost_vnd_snapshot),'{}'::jsonb)
  INTO v_line_count,v_saved_compare,v_cost_snapshots
  FROM public.taphoa_order_items i
  WHERE i.order_id=p_order_id;

  -- Compare exact saved STT/code/qty/sale-price/note with the client
  -- read-only review snapshot before changing either order.
  SELECT coalesce(jsonb_agg(
    jsonb_build_array((j.item->>'line_no')::integer,
                      j.item->>'product_id',
                      (j.item->>'qty')::numeric,
                      (j.item->>'unit_price')::numeric,
                      coalesce(j.item->>'note',''))
    ORDER BY (j.item->>'line_no')::integer,j.item->>'product_id'),'[]'::jsonb)
  INTO v_expected_compare
  FROM jsonb_array_elements(p_expected_items) AS j(item);
  IF v_saved_compare IS DISTINCT FROM v_expected_compare THEN
    RAISE EXCEPTION 'split_order_changed_open_again';
  END IF;

  v_selected_count := cardinality(p_selected_codes);
  IF v_selected_count IS NULL OR v_selected_count<1
    OR v_selected_count>=v_line_count THEN
    RAISE EXCEPTION 'split_requires_selected_and_remaining_lines';
  END IF;
  IF (SELECT count(DISTINCT code)
      FROM unnest(p_selected_codes) AS codes(code))<>v_selected_count
    OR EXISTS(
      SELECT 1 FROM unnest(p_selected_codes) AS codes(code)
      WHERE code IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.taphoa_order_items i
        WHERE i.order_id=p_order_id AND i.product_code=code)
    )
  THEN RAISE EXCEPTION 'split_invalid_selected_codes'; END IF;

  -- Independently reindex both resulting orders without changing row order.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'product_id',r.product_code,'qty',r.qty,'unit_price',r.unit_price_vnd,
    'line_no',r.new_line,'note',coalesce(r.note,''))
    ORDER BY r.new_line),'[]'::jsonb)
  INTO v_remaining
  FROM (
    SELECT i.*,row_number() over(order by i.line_no,i.product_code) AS new_line
    FROM public.taphoa_order_items i
    WHERE i.order_id=p_order_id AND NOT(i.product_code=ANY(p_selected_codes))
  ) r;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'product_id',r.product_code,'qty',r.qty,'unit_price',r.unit_price_vnd,
    'line_no',r.new_line,'note',coalesce(r.note,''))
    ORDER BY r.new_line),'[]'::jsonb)
  INTO v_selected
  FROM (
    SELECT i.*,row_number() over(order by i.line_no,i.product_code) AS new_line
    FROM public.taphoa_order_items i
    WHERE i.order_id=p_order_id AND i.product_code=ANY(p_selected_codes)
  ) r;

  v_old_code:=coalesce(
    nullif(public.taphoa_order_frontend_json(v_source)->>'displayCode',''),
    p_order_id::text);

  -- The two existing save-order commands run inside THIS transaction.
  -- Source keeps its DT code. Child is always a separate new DT/DG.
  v_source_result:=public.taphoa_save_order(jsonb_build_object(
    'edit_order_id',p_order_id::text,
    'customer_id',v_source.customer_account_id,
    'status','pending','note',coalesce(v_source.note,''),
    'items',v_remaining
  ),v_source_command);

  v_child_result:=public.taphoa_save_order(jsonb_build_object(
    'customer_id',v_source.customer_account_id,
    'status',v_target_status,
    'note',concat_ws(' · ',nullif(btrim(coalesce(v_source.note,'')),''),
      'Tách từ '||v_old_code),
    'items',v_selected
  ),v_child_command);

  IF coalesce((v_source_result->>'ok')::boolean,false) IS NOT TRUE
     OR coalesce((v_child_result->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'split_save_failed';
  END IF;
  v_child_id:=nullif(v_child_result->'order'->>'id','')::uuid;
  IF v_child_id IS NULL THEN RAISE EXCEPTION 'split_child_missing'; END IF;

  -- Generic new-order save uses current catalog cost. Restore the original
  -- per-line historical cost snapshots, preserving private/special sale prices.
  UPDATE public.taphoa_order_items i
    SET unit_cost_vnd_snapshot=coalesce(
      (v_cost_snapshots->>i.product_code)::numeric,i.unit_cost_vnd_snapshot)
    WHERE i.order_id=v_child_id AND v_cost_snapshots ? i.product_code;

  IF v_target_status='delivered' THEN
    -- Same missing-cost protection as taphoa_deliver_order.
    IF EXISTS(
      SELECT 1 FROM public.taphoa_order_items i
      JOIN public.taphoa_products p ON p.product_code=i.product_code
      WHERE i.order_id=v_child_id AND i.unit_price_vnd>0
        AND i.unit_cost_vnd_snapshot=0
        AND p.input_price_vnd IS DISTINCT FROM 0
    ) THEN
      RAISE EXCEPTION 'order_cost_missing' USING errcode='22023';
    END IF;
  END IF;

  v_result:=jsonb_build_object(
    'ok',true,
    'source_order',v_source_result->'order',
    'order',v_child_result->'order',
    'child_command_id',v_child_command,
    'selected_count',v_selected_count,
    'target_status',v_target_status
  );
  INSERT INTO public.taphoa_command_log(command_id,operation,result)
    VALUES(p_command_id,'split_pending_order',v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.taphoa_split_pending_order(uuid,text[],jsonb,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_split_pending_order(uuid,text[],jsonb,text,uuid)
  TO authenticated,service_role;
