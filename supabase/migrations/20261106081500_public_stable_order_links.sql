-- PUBLIC-LINK-241: durable, customer-scoped order references.
-- DT numbers change to DG numbers upon delivery; old shared links must
-- still resolve to the same immutable order UUID after this transition.
create table if not exists v21_private.taphoa_order_public_codes (
  customer_account_id uuid not null,
  display_code text not null,
  order_id uuid not null references public.taphoa_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(customer_account_id,display_code),
  constraint taphoa_order_public_codes_format check(display_code ~ '^(DT|DG)[0-9]+$')
);
create index if not exists taphoa_order_public_codes_order_idx
  on v21_private.taphoa_order_public_codes(order_id);
alter table v21_private.taphoa_order_public_codes enable row level security;
revoke all on v21_private.taphoa_order_public_codes from public,anon,authenticated;

create or replace function v21_private.taphoa_capture_order_public_code()
returns trigger language plpgsql security definer
set search_path='public','v21_private','pg_temp'
as $function$
declare v_previous text;v_next text;
begin
 if TG_OP='UPDATE' and old.customer_account_id is not null then
  if old.customer_account_id is distinct from new.customer_account_id then
   delete from v21_private.taphoa_order_public_codes
     where order_id=old.id and customer_account_id=old.customer_account_id;
  elsif old.display_prefix in ('DG','DT') and old.display_no is not null then
   v_previous:=old.display_prefix||old.display_no::text;
   insert into v21_private.taphoa_order_public_codes(customer_account_id,display_code,order_id)
   values(old.customer_account_id,v_previous,old.id)
   on conflict(customer_account_id,display_code) do nothing;
  end if;
 end if;
 if new.customer_account_id is not null and new.display_prefix in ('DG','DT')
    and new.display_no is not null then
  v_next:=new.display_prefix||new.display_no::text;
  insert into v21_private.taphoa_order_public_codes(customer_account_id,display_code,order_id)
  values(new.customer_account_id,v_next,new.id)
  on conflict(customer_account_id,display_code) do nothing;
 end if;
 return new;
end;
$function$;
drop trigger if exists taphoa_capture_order_public_code_trg on public.taphoa_orders;
create trigger taphoa_capture_order_public_code_trg
after insert or update of display_prefix,display_no,customer_account_id
on public.taphoa_orders for each row
execute function v21_private.taphoa_capture_order_public_code();

-- Current visible codes for all existing customer orders.
insert into v21_private.taphoa_order_public_codes(customer_account_id,display_code,order_id)
select customer_account_id,display_prefix||display_no::text,id
from public.taphoa_orders
where customer_account_id is not null and display_prefix in ('DG','DT')
 and display_no is not null
on conflict(customer_account_id,display_code) do nothing;

-- Reconstruct historical DT codes from the canonical successful save
-- command log. Only map logs to orders that still belong to that customer.
insert into v21_private.taphoa_order_public_codes(customer_account_id,display_code,order_id)
select distinct o.customer_account_id,
 upper(l.result->'order'->>'displayCode'),o.id
from public.taphoa_command_log l
join public.taphoa_orders o
 on o.id=(l.result->'order'->>'order_id')::uuid
where l.operation in ('save_order','public_save_pending_order')
 and o.customer_account_id is not null
 and l.result->'order'->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and upper(l.result->'order'->>'displayCode') ~ '^(DG|DT)[0-9]+$'
on conflict(customer_account_id,display_code) do nothing;

-- Public resolver: authenticate via the existing PIN/account-owner gate,
-- then constrain every lookup to the same customer. UUID is not authorization.
create or replace function public.taphoa_public_resolve_order_access(
 p_public_slug text,p_pin text,p_code text default null,p_order_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path='public','v21_private','pg_temp'
as $function$
declare v_customer uuid;v_order public.taphoa_orders%rowtype;v_code text;
begin
 v_customer:=public.taphoa_public_customer_id_for_access(p_public_slug,p_pin);
 v_code:=upper(btrim(coalesce(p_code,'')));
 if p_order_id is not null then
  select * into v_order from public.taphoa_orders
  where id=p_order_id and customer_account_id=v_customer;
 elsif v_code ~ '^(DT|DG)[0-9]+$' then
  select o.* into v_order
  from v21_private.taphoa_order_public_codes c
  join public.taphoa_orders o on o.id=c.order_id
  where c.customer_account_id=v_customer
    and c.display_code=v_code
    and o.customer_account_id=v_customer
  limit 1;
 end if;
 if v_order.id is null then
  return jsonb_build_object('ok',false,'error','order_not_found');
 end if;
 return jsonb_build_object(
  'ok',true,'order_id',v_order.id,'display_code',
  coalesce(v_order.display_prefix,'')||coalesce(v_order.display_no::text,''),
  'status',v_order.status
 );
end;
$function$;

revoke all on function public.taphoa_public_resolve_order_access(text,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.taphoa_public_resolve_order_access(text,text,text,uuid)
to anon,authenticated,service_role;

-- New shared links always include an immutable order ID alongside the
-- human-readable display code, without putting a PIN or bearer key in the URL.
create or replace function public.taphoa_customer_mini_link(
 p_customer_id uuid,p_tab text default 'hang',p_source_key text default null,
 p_segment text default null,p_order_code text default null
)
returns text language plpgsql security definer
set search_path='public','v21_private','pg_temp'
as $
declare
 v_link jsonb;v_slug text;v_tab text:=lower(btrim(coalesce(p_tab,'hang')));
 v_source text:=lower(btrim(coalesce(p_source_key,'')));
 v_segment text:=lower(btrim(coalesce(p_segment,'')));
 v_order text:=upper(btrim(coalesce(p_order_code,'')));
 v_url text;v_order_id uuid;
begin
 if p_customer_id is null then return null; end if;
 if v_tab not in ('hang','don','no') then v_tab:='hang'; end if;
 if v_source<>'' and v_source !~ '^[a-z0-9-]+$' then v_source:=''; end if;
 if v_segment not in ('da-mua','goi-y','tat-ca') then v_segment:=''; end if;
 if v_order<>'' and v_order !~ '^(DG|DT)[0-9]+$' then v_order:=''; end if;
 v_link:=public.v21_customer_public_link_info_get_or_create(p_customer_id);
 v_slug:=nullif(v_link->>'public_slug','');
 if v_slug is null then return null; end if;
 v_url:='https://app.taphoa.xyz/kh/?kh='||v_slug||'&tab=' || v_tab;
 if v_tab='hang' and v_source<>'' then v_url:=v_url||'&nguon='||v_source; end if;
 if v_tab='hang' and v_segment<>'' and v_segment<>'tat-ca' then
  v_url:=v_url||'&muc='||v_segment;
 end if;
 if v_tab='don' and v_order<>'' then
  v_url:=v_url||'&don='||v_order;
  select o.id into v_order_id from public.taphoa_orders o
  where o.customer_account_id=p_customer_id
    and (o.display_prefix||o.display_no::text)=v_order limit 1;
  if v_order_id is null then
   select c.order_id into v_order_id
   from v21_private.taphoa_order_public_codes c
   join public.taphoa_orders o on o.id=c.order_id
   where c.customer_account_id=p_customer_id and c.display_code=v_order
     and o.customer_account_id=p_customer_id limit 1;
  end if;
  if v_order_id is not null then v_url:=v_url||'&oid='||v_order_id::text; end if;
 end if;
 return v_url;
end;
$;
revoke all on function v21_private.taphoa_capture_order_public_code()
from public,anon,authenticated;
