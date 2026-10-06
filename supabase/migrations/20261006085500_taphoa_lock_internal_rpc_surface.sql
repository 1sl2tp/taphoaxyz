-- Tighten the TAPHOA RPC surface without changing application behavior.
-- Core tables stay RPC-only: anon/authenticated have no direct table grants.
-- Public PIN endpoints and authenticated application RPCs remain unchanged.

begin;

-- Internal helper: application RPCs call this as their SECURITY DEFINER owner.
-- The browser does not call it directly, so authenticated users do not need EXECUTE.
revoke execute on function public.taphoa_access_context() from public, anon, authenticated;
grant execute on function public.taphoa_access_context() to service_role;

-- Legacy web source mutation endpoints are retired. Source management no longer
-- has a browser mutation path, so keep these callable only by trusted backend roles.
revoke execute on function public.taphoa_create_source_from_web(text) from public, anon, authenticated;
revoke execute on function public.taphoa_delete_source_from_web(text) from public, anon, authenticated;
grant execute on function public.taphoa_create_source_from_web(text) to service_role;
grant execute on function public.taphoa_delete_source_from_web(text) to service_role;

-- Defense in depth for RPC-owned business tables. These grants are already absent
-- in production; keeping the revokes in schema history prevents accidental direct
-- browser access if a later migration recreates a table or broad grant.
revoke all on table
  public.taphoa_command_log,
  public.taphoa_debt_ledger,
  public.taphoa_order_items,
  public.taphoa_orders,
  public.taphoa_product_media,
  public.taphoa_product_price_history,
  public.taphoa_products,
  public.taphoa_sources,
  public.taphoa_supplier_price_feedback
from anon, authenticated;

commit;
