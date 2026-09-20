-- Read-only supermarket search for the sales search toggle.
-- Available to authenticated TAPHOA admins and customers.
create or replace function public.taphoa_market_search(
  p_query text,
  p_limit integer default 80
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
  v_limit integer := greatest(1,least(coalesce(p_limit,80),120));
begin
  v_ctx := public.taphoa_access_context();
  if coalesce((v_ctx->>'allowed')::boolean,false) is not true
     or coalesce(v_ctx->>'taphoa_role','') not in ('admin','customer') then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if v_query_norm='' then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id','link:'||x.id,
        'name',x.name,
        'image_url',x.image_url,
        'current_price',x.current_price,
        'source',x.source
      )
      order by x.rank_order,x.current_price nulls last,x.name
    )
    from (
      select
        l.id,
        l.name,
        l.current_price,
        l.source,
        a.image_url,
        case
          when lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
          when lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
          else 2
        end as rank_order
      from public.getlink_links l
      join public.getlink_link_assets a on a.link_url=l.canonical_url
      where l.source in ('GO!','WinMart','Bách Hóa XANH')
        and a.image_url is not null
        and btrim(a.image_url)<>''
        and l.current_price is not null
        and l.current_price>0
        and not exists (
          select 1
          from regexp_split_to_table(v_query_norm,'\s+') token
          where btrim(token)<>''
            and lower(extensions.unaccent(coalesce(l.name,''))) not like '%'||token||'%'
        )
      order by rank_order,l.current_price nulls last,l.name
      limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.taphoa_market_search(text,integer) from public, anon;
grant execute on function public.taphoa_market_search(text,integer) to authenticated;
