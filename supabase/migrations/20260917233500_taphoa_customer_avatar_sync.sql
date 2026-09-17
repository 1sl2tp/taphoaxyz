create or replace function public.taphoa_customers_frontend_json(p_ctx jsonb)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id::text,
      'maKH',a.id::text,
      'ten',a.display_name,
      'name',a.display_name,
      'username',a.username,
      'avatar',nullif(a.avatar_path,''),
      'active',true
    ) order by a.display_name,a.username
  ),'[]'::jsonb)
  from public.v21_accounts a
  where a.role = 'user'
    and a.contact_group = 'customer'
    and a.deleted_at is null
    and a.locked_at is null
    and (
      p_ctx->>'taphoa_role' = 'admin'
      or a.id = nullif(p_ctx->>'account_id','')::uuid
    );
$function$;

create or replace function public.taphoa_bump_customers_revision_from_v21_accounts()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if (
    (tg_op = 'DELETE' and old.role = 'user' and old.contact_group = 'customer')
    or
    (tg_op <> 'DELETE' and new.role = 'user' and new.contact_group = 'customer')
    or
    (tg_op = 'UPDATE' and old.role = 'user' and old.contact_group = 'customer')
  ) then
    insert into public.taphoa_revisions(domain,revision,updated_at)
    values ('customers',1,now())
    on conflict (domain) do update
      set revision = public.taphoa_revisions.revision + 1,
          updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.taphoa_bump_customers_revision_from_v21_accounts() from public, anon, authenticated;

drop trigger if exists taphoa_v21_accounts_customers_revision_trg on public.v21_accounts;
create trigger taphoa_v21_accounts_customers_revision_trg
after insert or delete or update of display_name, username, avatar_path, role, contact_group, deleted_at, locked_at
on public.v21_accounts
for each row
execute function public.taphoa_bump_customers_revision_from_v21_accounts();
