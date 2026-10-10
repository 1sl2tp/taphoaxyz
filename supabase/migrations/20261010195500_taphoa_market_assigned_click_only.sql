-- SPEC-TAPHOA-MARKET-ASSIGNED-CLICK-ONLY-20261010 / Rule AI-47
-- Admin click on assigned supermarket sources is the only creator of a NEW price refresh.
-- Keep active manual jobs, mapped queue categories, and the existing worker/recovery.
-- This DDL does not call workers, fetch provider data, or run an update job.
CREATE OR REPLACE FUNCTION public.taphoa_admin_market_update_run_now()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  v_ctx jsonb:=public.taphoa_access_context();
  v_run_id text;
  v_now timestamptz:=now();
  v_total integer:=0;
  v_secret text;
  v_request bigint;
begin
  if not coalesce((v_ctx->>'allowed')::boolean,false)
     or v_ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select r.id into v_run_id
  from public.getlink_update_runs r
  where r.status in ('queued','running')
  order by r.created_at desc limit 1;

  if v_run_id is null then
    v_run_id:='upd_'||replace(gen_random_uuid()::text,'-','');

    select count(*) into v_total
    from (
      select distinct coalesce(nullif(l.parent_url,''),l.canonical_url) as category_url
      from public.taphoa_product_market_links ml
      join public.getlink_links l
        on ml.canonical_product_id like 'link:%'
       and l.id=substr(ml.canonical_product_id,6)
      where l.source in ('GO!','WinMart','Bách Hóa XANH','VNM')
        and coalesce(nullif(l.parent_url,''),l.canonical_url) is not null
    ) q;

    insert into public.getlink_update_runs(
      id,trigger_kind,scope,status,total_categories,created_at,started_at
    ) values(
      v_run_id,'manual','mapped',
      case when v_total>0 then 'running' else 'error' end,
      v_total,v_now,v_now
    );

    if v_total>0 then
      insert into public.getlink_update_queue(
        run_id,category_url,source,status,created_at
      )
      select distinct
        v_run_id,
        coalesce(nullif(l.parent_url,''),l.canonical_url),
        l.source,
        'pending',
        v_now
      from public.taphoa_product_market_links ml
      join public.getlink_links l
        on ml.canonical_product_id like 'link:%'
       and l.id=substr(ml.canonical_product_id,6)
      where l.source in ('GO!','WinMart','Bách Hóa XANH','VNM')
        and coalesce(nullif(l.parent_url,''),l.canonical_url) is not null
      on conflict do nothing;

      update public.getlink_update_settings
      set enabled=false,last_started_at=v_now,last_status='running',
          last_error=null,scope='mapped',updated_at=v_now
      where id=1;
    else
      update public.getlink_update_runs
      set finished_at=v_now,last_error='no_mapped_market_links'
      where id=v_run_id;
    end if;
  end if;

  select cron_secret into v_secret
  from public.getlink_update_settings where id=1;

  if v_secret is not null and v_run_id is not null then
    select net.http_post(
      url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/getlink-api/api/auto-update/worker',
      headers:=jsonb_build_object(
        'content-type','application/json','x-getlink-cron',v_secret
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=60000
    ) into v_request;
  end if;

  return jsonb_build_object(
    'ok',true,'run_id',v_run_id,'request_id',v_request,
    'status',(select status from public.getlink_update_runs where id=v_run_id),
    'total_categories',(select total_categories from public.getlink_update_runs where id=v_run_id),
    'done_categories',(select done_categories from public.getlink_update_runs where id=v_run_id),
    'scope',(select scope from public.getlink_update_runs where id=v_run_id)
  );
end;
$function$;

-- Stop scheduled 7-day starts while keeping manual job completion/recovery.
UPDATE public.getlink_update_settings
SET enabled=false, updated_at=now()
WHERE id=1 AND enabled=true;
