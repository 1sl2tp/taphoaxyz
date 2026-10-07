-- Public quote visit analytics.
-- One compact row per anonymous browser/day; each page open increments view_count.
-- No raw IP, precise location, message content, or media is stored.

create table if not exists public.taphoa_quote_visit_daily (
  visit_date date not null,
  page_key text not null default 'bao-gia',
  visitor_hash text not null,
  view_count integer not null default 1 check (view_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device_type text,
  browser text,
  os text,
  referrer_host text,
  last_source text,
  primary key (visit_date,page_key,visitor_hash)
);

create index if not exists taphoa_quote_visit_daily_last_seen_idx
  on public.taphoa_quote_visit_daily(last_seen_at desc);

alter table public.taphoa_quote_visit_daily enable row level security;
revoke all on table public.taphoa_quote_visit_daily from public,anon,authenticated;

create or replace function public.taphoa_public_quote_record_visit(
  p_visitor_id text,
  p_device_type text default '',
  p_browser text default '',
  p_os text default '',
  p_referrer_host text default '',
  p_source text default ''
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

  insert into public.taphoa_quote_visit_daily(
    visit_date,page_key,visitor_hash,view_count,first_seen_at,last_seen_at,
    device_type,browser,os,referrer_host,last_source
  )
  values(
    v_day,'bao-gia',v_hash,1,now(),now(),
    left(nullif(btrim(p_device_type),''),24),
    left(nullif(btrim(p_browser),''),40),
    left(nullif(btrim(p_os),''),40),
    left(nullif(btrim(p_referrer_host),''),160),
    case when p_source in ('sua','hang-thuong','hang-u','thuoc-la') then p_source else null end
  )
  on conflict (visit_date,page_key,visitor_hash) do update
  set view_count=public.taphoa_quote_visit_daily.view_count+1,
      last_seen_at=now(),
      device_type=coalesce(excluded.device_type,public.taphoa_quote_visit_daily.device_type),
      browser=coalesce(excluded.browser,public.taphoa_quote_visit_daily.browser),
      os=coalesce(excluded.os,public.taphoa_quote_visit_daily.os),
      referrer_host=coalesce(excluded.referrer_host,public.taphoa_quote_visit_daily.referrer_host),
      last_source=coalesce(excluded.last_source,public.taphoa_quote_visit_daily.last_source);
end;
$function$;

revoke all on function public.taphoa_public_quote_record_visit(text,text,text,text,text,text) from public;
grant execute on function public.taphoa_public_quote_record_visit(text,text,text,text,text,text) to anon,authenticated;

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
        'browser',coalesce(r.browser,''),
        'os',coalesce(r.os,''),
        'referrer_host',coalesce(r.referrer_host,''),
        'last_source',coalesce(r.last_source,'')
      ) order by r.last_seen_at desc)
      from (
        select last_seen_at,view_count,device_type,browser,os,referrer_host,last_source
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
