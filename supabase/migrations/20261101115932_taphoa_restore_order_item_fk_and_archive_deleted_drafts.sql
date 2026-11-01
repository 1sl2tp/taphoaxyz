-- SPEC-ORDER-ITEM-ORPHAN-FK-20261101
-- Given a deleted pending order, its detail rows must not remain as phantom items.
-- Preserves live delivered/reversed orders and every debt-ledger entry.
-- Rollback evidence: the old rows are archived in v21_private before cleanup.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.taphoa_order_items i
    WHERE NOT EXISTS (SELECT 1 FROM public.taphoa_orders o WHERE o.id=i.order_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.taphoa_command_log c
        WHERE c.operation='delete_pending_order'
          AND c.result->>'deleted'=i.order_id::text
      )
  ) THEN
    RAISE EXCEPTION 'orphan_order_item_without_confirmed_deleted_draft';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.taphoa_order_items i
    JOIN public.taphoa_debt_ledger l ON l.order_id=i.order_id
    WHERE NOT EXISTS (SELECT 1 FROM public.taphoa_orders o WHERE o.id=i.order_id)
  ) THEN
    RAISE EXCEPTION 'orphan_order_item_with_financial_entry';
  END IF;
END;
$check$;

CREATE TABLE IF NOT EXISTS v21_private.taphoa_orphan_order_items_archive_20261101 AS
  SELECT i.*, now()::timestamptz AS archived_at
  FROM public.taphoa_order_items i WHERE false;
ALTER TABLE v21_private.taphoa_orphan_order_items_archive_20261101 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE v21_private.taphoa_orphan_order_items_archive_20261101
  FROM PUBLIC, anon, authenticated;

INSERT INTO v21_private.taphoa_orphan_order_items_archive_20261101
SELECT i.*, now()
FROM public.taphoa_order_items i
WHERE NOT EXISTS (SELECT 1 FROM public.taphoa_orders o WHERE o.id=i.order_id)
  AND NOT EXISTS (
    SELECT 1 FROM v21_private.taphoa_orphan_order_items_archive_20261101 a
    WHERE a.id=i.id
  );

DELETE FROM public.taphoa_order_items i
WHERE NOT EXISTS (SELECT 1 FROM public.taphoa_orders o WHERE o.id=i.order_id)
  AND EXISTS (
    SELECT 1 FROM v21_private.taphoa_orphan_order_items_archive_20261101 a
    WHERE a.id=i.id
  );

-- Reinstate the ON DELETE CASCADE relation specified by the original core schema.
-- This closes all deletion paths, including single, batch, and public pending orders.
ALTER TABLE public.taphoa_order_items
  ADD CONSTRAINT taphoa_order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.taphoa_orders(id) ON DELETE CASCADE;
