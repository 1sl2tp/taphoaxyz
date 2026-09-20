-- Runtime fix: order/limit candidates before jsonb_agg.
create or replace function public.taphoa_product_media_candidates(
  p_query text,
  p_limit integer default 150
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
  v_limit integer := greatest(1,least(coalesce(p_limit,150),200));
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
      'pack_kind',x.pack_kind,
      'pack_quantity',x.pack_quantity,
      'pack_unit',x.pack_unit,
      'carton_price',x.carton_price,
      'retail_price',x.retail_price,
      'units_per_carton',x.units_per_carton,
      'pack_label2',x.label2,
      'pack_qty2',x.qty2,
      'pack_label3',x.label3,
      'pack_qty3',x.qty3,
      'promotion_active',x.promotion_active,
      'current_price',x.current_price
    ) order by x.rank_order,x.sort_price nulls last,x.source,x.name)
    from (
      select y.*
      from (
        select
          q.*,
          case when q.pack_kind='carton' then q.pack_price else null end as carton_price,
          case
            when q.pack_kind='carton' and coalesce(q.units_per_carton,0)>1 and q.pack_price is not null
              then q.pack_price::numeric / q.units_per_carton
            else coalesce(
              case when q.promotion_active then q.promo_unit_price end,
              q.regular_unit_price,
              case
                when coalesce(q.pack_quantity,0)>1 and q.current_price is not null
                  then q.current_price::numeric / nullif(q.pack_quantity,0)
                else q.current_price::numeric
              end
            )
          end as retail_price,
          coalesce(
            case
              when q.pack_kind='carton' and coalesce(q.units_per_carton,0)>1 and q.pack_price is not null
                then q.pack_price::numeric / q.units_per_carton
              else coalesce(
                case when q.promotion_active then q.promo_unit_price end,
                q.regular_unit_price,
                case
                  when coalesce(q.pack_quantity,0)>1 and q.current_price is not null
                    then q.current_price::numeric / nullif(q.pack_quantity,0)
                  else q.current_price::numeric
                end
              )
            end,
            q.pack_price::numeric
          ) as sort_price
        from (
          select
            l.id,l.name,l.source,l.packaging,l.current_price,l.canonical_url,a.image_url,
            c.pack_kind,c.pack_quantity,c.pack_unit,c.promotion_active,
            c.regular_unit_price,c.promo_unit_price,
            h.label2,h.qty2,h.label3,h.qty3,
            case
              when c.pack_kind='carton' then greatest(
                coalesce(c.pack_quantity,0),
                case
                  when coalesce(h.qty2,0)>1 and coalesce(h.qty3,0)>1 then
                    case when h.qty3>=h.qty2 then h.qty3 else h.qty2*h.qty3 end
                  when coalesce(h.qty3,0)>1 then h.qty3
                  when coalesce(h.qty2,0)>1 then h.qty2
                  else 0
                end
              )
              else null
            end as units_per_carton,
            coalesce(
              case when c.promotion_active then c.promo_pack_price end,
              c.regular_pack_price,
              l.current_price
            ) as pack_price,
            case
              when lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
              when v_query_norm<>'' and lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
              else 2
            end as rank_order
          from public.getlink_links l
          join public.getlink_link_assets a on a.link_url=l.canonical_url
          left join public.getlink_link_comparison c on c.link_url=l.canonical_url
          left join public.getlink_link_pack_hierarchy h on h.link_url=l.canonical_url
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
        ) q
      ) y
      order by y.rank_order,y.sort_price nulls last,y.source,y.name
      limit v_limit
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.taphoa_product_media_candidates(text,integer) from public, anon;
grant execute on function public.taphoa_product_media_candidates(text,integer) to authenticated;
