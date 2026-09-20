-- Fix accent-insensitive supermarket image search in the production schema.
-- Supabase installs unaccent in the extensions schema, while this SECURITY DEFINER
-- function intentionally keeps a narrow search_path.

create or replace function public.taphoa_product_media_candidates(
  p_query text,
  p_limit integer default 18
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_query_norm text := lower(extensions.unaccent(btrim(coalesce(p_query,''))));
  v_limit integer := greatest(1,least(coalesce(p_limit,18),50));
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id','link:'||x.id,
      'name',x.name,
      'image_url',x.image_url,
      'image_source_url',x.canonical_url,
      'source',x.source,
      'packaging',x.packaging,
      'current_price',x.current_price
    ) order by x.rank_order,x.source,x.name)
    from (
      select
        l.id,l.name,l.source,l.packaging,l.current_price,l.canonical_url,a.image_url,
        case
          when lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
          when v_query_norm<>'' and lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
          else 2
        end as rank_order
      from public.getlink_links l
      join public.getlink_link_assets a on a.link_url=l.canonical_url
      where a.image_url is not null
        and btrim(a.image_url)<>''
        and l.source in ('GO!','WinMart','Bách Hóa XANH')
        and (
          v_query_norm=''
          or not exists (
            select 1
            from regexp_split_to_table(v_query_norm,'\s+') token
            where btrim(token)<>''
              and lower(extensions.unaccent(coalesce(l.name,''))) not like '%'||token||'%'
          )
        )
      order by rank_order,l.source,l.name,l.updated_at desc
      limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.taphoa_product_media_candidates(text,integer) from public, anon;
grant execute on function public.taphoa_product_media_candidates(text,integer) to authenticated;
