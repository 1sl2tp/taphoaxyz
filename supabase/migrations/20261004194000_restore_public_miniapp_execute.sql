-- Restore the public customer mini-app RPC surface after the shared
-- Supabase cutover. These functions are SECURITY DEFINER access wrappers;
-- underlying tables remain closed and authorization/PIN checks stay inside
-- the functions.

grant execute on function public.taphoa_public_gate_state(text)
  to anon,authenticated;
grant execute on function public.taphoa_public_pin_create(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_pin_check(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_pin_manage_access(text,text,text)
  to anon,authenticated;

grant execute on function public.taphoa_public_bootstrap_access(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_domains_access(text,text,text[])
  to anon,authenticated;
grant execute on function public.taphoa_public_order_detail_access(text,text,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_debt_ledger_access(text,text,timestamptz,bigint,integer)
  to anon,authenticated;
grant execute on function public.taphoa_public_save_pending_access(text,text,jsonb,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_delete_pending_access(text,text,uuid,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_employee_link_access(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_employee_snapshot_access(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_shared_cart_save_access(text,text,jsonb)
  to anon,authenticated;

-- Backward compatibility for already-cached clients that still call the
-- pre-access wrapper names.
grant execute on function public.taphoa_public_bootstrap_by_pin(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_domains_by_pin(text,text,text[])
  to anon,authenticated;
grant execute on function public.taphoa_public_order_detail_by_pin(text,text,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_debt_ledger_by_pin(text,text,timestamptz,bigint,integer)
  to anon,authenticated;
grant execute on function public.taphoa_public_save_pending_by_pin(text,text,jsonb,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_delete_pending_by_pin(text,text,uuid,uuid)
  to anon,authenticated;
grant execute on function public.taphoa_public_employee_link_by_pin(text,text)
  to anon,authenticated;
grant execute on function public.taphoa_public_employee_snapshot_by_pin(text,text)
  to anon,authenticated;
