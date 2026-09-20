-- Add source filtering to the supermarket quick search while preserving the 2-argument RPC.
create or replace function public.taphoa_market_search(
  p_query text,
  p_limit integer,
  p_source text
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
  v_source text := btrim(coalesce(p_source,''));
begin
  v_ctx := public.taphoa_access_context();
  if coalesce((v_ctx->>'allowed')::boolean,false) is not true
     or coalesce(v_ctx->>'taphoa_role','') not in ('admin','customer') then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if v_source not in ('','GO!','WinMart','Bách Hóa XANH') then
    v_source := '';
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
      order by
        case when v_query_norm='' then x.updated_at end desc nulls last,
        case when v_query_norm<>'' then x.rank_order end,
        case when v_query_norm<>'' then x.current_price end nulls last,
        x.name
    )
    from (
      select
        l.id,
        l.name,
        l.current_price,
        l.source,
        l.updated_at,
        a.image_url,
        case
          when v_query_norm='' then 0
          when lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
          when lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
          else 2
        end as rank_order
      from public.getlink_links l
      join public.getlink_link_assets a on a.link_url=l.canonical_url
      where l.source in ('GO!','WinMart','Bách Hóa XANH')
        and (v_source='' or l.source=v_source)
        and a.image_url is not null
        and btrim(a.image_url)<>''
        and l.current_price is not null
        and l.current_price>0
        and (
          v_query_norm=''
          or not exists (
            select 1
            from regexp_split_to_table(v_query_norm,'\s+') token
            where btrim(token)<>''
              and lower(extensions.unaccent(coalesce(l.name,''))) not like '%'||token||'%'
          )
        )
      order by
        case when v_query_norm='' then l.updated_at end desc nulls last,
        case
          when v_query_norm<>'' and lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
          when v_query_norm<>'' and lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
          when v_query_norm<>'' then 2
          else 0
        end,
        case when v_query_norm<>'' then l.current_price end nulls last,
        l.name
      limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.taphoa_market_search(text,integer,text) from public, anon;
grant execute on function public.taphoa_market_search(text,integer,text) to authenticated;
