-- Build browser-openable GO! product URLs without changing canonical link identity.
-- GO! requires the internal product id suffix: ...-i.<source_product_id>.

create or replace function public.taphoa_market_open_url(
  p_url text,
  p_source text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(p_source,'')='GO!'
      and coalesce(p_url,'') like 'https://sieuthi-go.vn/product/%'
      and coalesce(p_url,'') !~ '-i\.[0-9]+(?:$|[?#])'
    then coalesce(
      (
        select p_url||'-i.'||i.source_product_id
        from public.getlink_source_product_identity i
        where i.link_url=p_url
          and coalesce(i.source_name,'')='GO!'
          and coalesce(i.source_product_id,'') ~ '^[0-9]+$'
        limit 1
      ),
      p_url
    )
    else p_url
  end;
$$;

create or replace function public.taphoa_normalize_product_media_source_url()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_link_url text;
  v_source text;
begin
  if coalesce(new.market_source,'')='GO!' then
    if coalesce(new.canonical_product_id,'') like 'link:%' then
      select l.canonical_url,l.source
        into v_link_url,v_source
      from public.getlink_links l
      where l.id=substr(new.canonical_product_id,6)
      limit 1;

      if v_link_url is not null then
        new.image_source_url:=public.taphoa_market_open_url(v_link_url,v_source);
      else
        new.image_source_url:=public.taphoa_market_open_url(new.image_source_url,new.market_source);
      end if;
    else
      new.image_source_url:=public.taphoa_market_open_url(new.image_source_url,new.market_source);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists taphoa_normalize_product_media_source_url_trg on public.taphoa_product_media;
create trigger taphoa_normalize_product_media_source_url_trg
before insert or update of image_source_url,canonical_product_id,market_source
on public.taphoa_product_media
for each row
execute function public.taphoa_normalize_product_media_source_url();

update public.taphoa_product_media m
set image_source_url=public.taphoa_market_open_url(l.canonical_url,l.source),
    updated_at=now()
from public.getlink_links l
where m.canonical_product_id='link:'||l.id
  and l.source='GO!'
  and m.image_source_url is distinct from public.taphoa_market_open_url(l.canonical_url,l.source);

revoke all on function public.taphoa_market_open_url(text,text) from public, anon;
