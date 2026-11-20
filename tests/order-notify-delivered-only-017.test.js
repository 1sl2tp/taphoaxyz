import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261115170000_disable_pending_order_auto_notice.sql','utf8');
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
const fixture=readFileSync('tests/sql/staff-order-notice-014-isolated.sql','utf8');
test('pending order create and edit do not automatically notify anyone',()=>{
 assert.match(sql,/pending_start := position/);
 assert.match(sql,/staff_start := position/);
 assert.match(sql,/src := left\(src,pending_start-1\)\|\|substr\(src,staff_start\)/);
 assert.match(sql,/and v_status=''delivered''/);
 assert.match(sql,/NOT IN \(''done'',''delivered''\)/);
 assert(!bridge.includes('autoPending:true'));
 assert(!bridge.includes("savedStatus==='pending'&&result.order.customer_id"));
 assert.match(bridge,/\['done','delivered'\]\.includes\(savedStatus\)&&result\?\.order/);
 for(const c of ['DRAFT CREATED A NOTIFICATION','DRAFT EDIT CREATED A NOTIFICATION',
  'DELIVERED ORDER NOTIFY REGRESSION','PENDING STAFF HELPER WAS NOT SUPPRESSED']){
   assert(fixture.includes(c),c);
 }
});
test('non-draft customer opt-in, staff recipient and image-only flow are preserved',()=>{
 assert(bridge.includes('result.image_attached=await attachOrderNoticePortrait(result.order)===true;'));
 assert(bridge.includes('attachCommittedOrderNotices(result,result.staff_notice_command_id)'));
 assert(!/DROP\s+TABLE|DELETE\s+FROM\s+public\.v21_messages/i.test(sql));
});

test('mobile/PWA picks up the delivered-only notification code',()=>{
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert(html.includes('order-image=20261115-017'));
 const cacheVersion=Number(sw.match(/CACHE_NAME='taphoa-runtime-v(\d+)'/)?.[1]||0);
 assert(cacheVersion>=44,'PWA cache must retain delivered-only fix and allow newer releases');
});
