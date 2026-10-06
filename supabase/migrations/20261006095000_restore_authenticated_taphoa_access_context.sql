-- Restore the authenticated TAPHOA access check used directly by src/core/auth.js.
-- Keep anonymous/public callers blocked.

begin;

revoke execute on function public.taphoa_access_context() from public, anon;
grant execute on function public.taphoa_access_context() to authenticated, service_role;

commit;
