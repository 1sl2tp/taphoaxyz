-- Enrich quote visit analytics with coarse IP geolocation and device model.
-- Public IP is masked in the browser before storage. No GPS permission is requested.

alter table public.taphoa_quote_visit_daily
  add column if not exists device_model text,
  add column if not exists ip_masked text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists postal text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists network_org text;

create or replace function public.taphoa_public_quote_enrich_visit(
  p_visitor_id text,
  p_device_model text default '',
  p_ip_masked text default '',
  p_city text default '',
  p_region text default '',
  p_country text default '',
  p_postal text default '',
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_org text default ''
)
returns void
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_id text := btrim(coalesce(p_visitor_id,''));
  v_hash text;
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if char_length(v_id) < 8 or char_length(v_id) > 160 then
    return;
  end if;
  v_hash := encode(extensions.digest(v_id,'sha256'),'hex');

  update public.taphoa_quote_visit_daily
  set device_model=left(nullif(btrim(p_device_model),''),100),
      ip_masked=left(nullif(btrim(p_ip_masked),''),80),
      city=left(nullif(btrim(p_city),''),80),
      region=left(nullif(btrim(p_region),''),100),
      country=left(nullif(btrim(p_country),''),80),
      postal=left(nullif(btrim(p_postal),''),24),
      latitude=case when p_latitude between -90 and 90 then round(p_latitude,4) else null end,
      longitude=case when p_longitude between -180 and 180 then round(p_longitude,4) else null end,
      network_org=left(nullif(btrim(p_org),''),120)
  where visit_date=v_day and page_key='bao-gia' and visitor_hash=v_hash;
end;
$function$;

revoke all on function public.taphoa_public_quote_enrich_visit(text,text,text,text,text,text,text,numeric,numeric,text) from public;
grant execute on function public.taphoa_public_quote_enrich_visit(text,text,text,text,text,text,text,numeric,numeric,text) to anon,authenticated;

create or replace function public.taphoa_admin_quote_visit_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_ctx jsonb;
  v_days integer := greatest(7,least(coalesce(p_days,30),90));
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  v_ctx:=public.taphoa_access_context();
  if coalesce((v_ctx->>'allowed')::boolean,false) is not true
     or coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  return jsonb_build_object(
    'total_views',coalesce((select sum(view_count) from public.taphoa_quote_visit_daily where page_key='bao-gia'),0),
    'today_views',coalesce((select sum(view_count) from public.taphoa_quote_visit_daily where page_key='bao-gia' and visit_date=v_today),0),
    'last_7_days',coalesce((select sum(view_count) from public.taphoa_quote_visit_daily where page_key='bao-gia' and visit_date between v_today-6 and v_today),0),
    'period_unique_visitors',coalesce((select count(distinct visitor_hash) from public.taphoa_quote_visit_daily where page_key='bao-gia' and visit_date between v_today-(v_days-1) and v_today),0),
    'days',v_days,
    'daily',coalesce((
      select jsonb_agg(jsonb_build_object(
        'day',d.day,
        'views',coalesce(x.views,0),
        'unique_visitors',coalesce(x.unique_visitors,0)
      ) order by d.day desc)
      from generate_series(v_today-(v_days-1),v_today,interval '1 day') d(day)
      left join (
        select visit_date,sum(view_count)::bigint views,count(*)::bigint unique_visitors
        from public.taphoa_quote_visit_daily
        where page_key='bao-gia'
          and visit_date between v_today-(v_days-1) and v_today
        group by visit_date
      ) x on x.visit_date=d.day::date
    ),'[]'::jsonb),
    'recent',coalesce((
      select jsonb_agg(jsonb_build_object(
        'last_seen_at',r.last_seen_at,
        'view_count',r.view_count,
        'device_type',coalesce(r.device_type,''),
        'device_model',coalesce(r.device_model,''),
        'browser',coalesce(r.browser,''),
        'os',coalesce(r.os,''),
        'ip_masked',coalesce(r.ip_masked,''),
        'city',coalesce(r.city,''),
        'region',coalesce(r.region,''),
        'country',coalesce(r.country,''),
        'postal',coalesce(r.postal,''),
        'latitude',r.latitude,
        'longitude',r.longitude,
        'network_org',coalesce(r.network_org,''),
        'referrer_host',coalesce(r.referrer_host,''),
        'last_source',coalesce(r.last_source,'')
      ) order by r.last_seen_at desc)
      from (
        select last_seen_at,view_count,device_type,device_model,browser,os,ip_masked,
               city,region,country,postal,latitude,longitude,network_org,referrer_host,last_source
        from public.taphoa_quote_visit_daily
        where page_key='bao-gia'
          and visit_date between v_today-(v_days-1) and v_today
        order by last_seen_at desc
        limit 50
      ) r
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.taphoa_admin_quote_visit_report(integer) from public;
grant execute on function public.taphoa_admin_quote_visit_report(integer) to authenticated;
