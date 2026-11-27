#!/usr/bin/env bash
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
psql=(psql -h localhost -U postgres -d recovery_fixture -v ON_ERROR_STOP=1 -qAt)
"${psql[@]}" <<'SQL'
-- Reuse only disposable fixture rows, create a fresh committed event.
insert into public.taphoa_orders values('00000000-0000-4000-8000-000000000025','delivered','00000000-0000-4000-8000-000000000003','DG',2,now()-interval '1 hour');
insert into public.taphoa_command_log
select '00000000-0000-4000-8000-000000000026','save_order',jsonb_build_object('ok',true,'order',jsonb_build_object('id',id,'customer_id',customer_account_id,'status','done','displayCode','DG2','items',jsonb_build_array(jsonb_build_object('qty',1)))),updated_at from public.taphoa_orders where display_no=2;
insert into public.v21_messages
select '00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','','taphoa:'||command_id||':order',created_at,null from public.taphoa_command_log where command_id='00000000-0000-4000-8000-000000000026';
SQL
claim() {
 "${psql[@]}" <<'SQL'
begin;
set local fixture.uid='00000000-0000-4000-8000-000000000002';
set local fixture.actor='00000000-0000-4000-8000-000000000001';
set local fixture.optin='yes';
select coalesce(r->>'mode',r->>'reason') from (select public.taphoa_order_notice_recover_prepare('00000000-0000-4000-8000-000000000027') r) q;
select pg_sleep(0.5);
commit;
SQL
}
claim >"$tmp/a" & a=$!
claim >"$tmp/b" & b=$!
wait "$a"; wait "$b"
test "$(cat "$tmp/a" "$tmp/b" | grep -c '^render_original$')" = 1
test "$(cat "$tmp/a" "$tmp/b" | grep -c '^active_ticket$')" = 1
"${psql[@]}" <<'SQL'
insert into storage.objects(bucket_id,name,metadata,owner_id)
select 'v21-media',storage_key,jsonb_build_object('size',100,'mimetype','image/png'),'00000000-0000-4000-8000-000000000002' from v21_private.taphoa_order_notice_image_uploads where message_id='00000000-0000-4000-8000-000000000027';
SQL
attach() {
 "${psql[@]}" <<'SQL'
begin;
set local fixture.uid='00000000-0000-4000-8000-000000000002';
set local fixture.actor='00000000-0000-4000-8000-000000000001';
set local fixture.optin='yes';
select public.taphoa_order_notice_recover_attach(message_id,asset_id,100,528,450)->>'ok' from v21_private.taphoa_order_notice_image_uploads where message_id='00000000-0000-4000-8000-000000000027';
select pg_sleep(0.5);
commit;
SQL
}
attach >"$tmp/c" & c=$!
attach >"$tmp/d" & d=$!
wait "$c"; wait "$d"
test "$(cat "$tmp/c" "$tmp/d" | grep -c '^true$')" = 2
test "$("${psql[@]}" -c "select count(*) from public.v21_media_assets where message_id='00000000-0000-4000-8000-000000000027'")" = 1
test "$("${psql[@]}" -c "select count(*) from public.v21_messages where id='00000000-0000-4000-8000-000000000027'")" = 1
echo 'Concurrent prepare and attach: one ticket, one media, one original message.'
