-- Clean malformed Sữa rows from the retired Sheet import path.
-- These rows had product_name values like SUA-000001 and were already inactive/discontinued.
-- Keep them as deleted history only; do not hard-delete referenced product codes.

update public.taphoa_products
set is_active=false,
    admin_state='discontinued',
    sync_status='deleted',
    deleted_at=coalesce(deleted_at,now()),
    stock_status='out_of_stock',
    stock_label='Dữ liệu import lỗi',
    updated_at=now()
where source_key='sua'
  and sync_status<>'deleted'
  and product_name ~ '^SUA-[0-9]{6}$';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.taphoa_products'::regclass
      and conname='taphoa_products_no_code_as_active_name'
  ) then
    alter table public.taphoa_products
      add constraint taphoa_products_no_code_as_active_name
      check (
        sync_status='deleted'
        or product_name !~ '^(HT|TL|SUA|HU|SP|MAS)-[0-9]{6}$'
      );
  end if;
end;
$$;

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';
