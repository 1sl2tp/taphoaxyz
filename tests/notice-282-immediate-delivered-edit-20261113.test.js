import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261113011000_notice282_immediate_order_edits.sql','utf8');
test('NOTICE-282 immediate delivered edit, retains explicit customer opt-in',()=>{
 assert.match(sql,/publication proceeds immediately/);
 assert.match(sql,/taphoa_chat_notify_customer\(uuid,uuid,text,text\)/);
 assert.match(sql,/taphoa_order_edit_quiet_release\(now\(\)\)/);
 assert.match(sql,/v21_private\.chat_outbound_allowed/);
 assert.match(sql,/q\.client_id IS DISTINCT FROM v_client_id/);
 assert.match(sql,/superseded_by_immediate_edit/);
 assert.match(sql,/v21_messages insert below/);
 assert.match(sql,/NOTICE-282: legacy queue may drain at any hour/);
 assert.match(sql,/q\.created_at<=now\(\)/);
 assert.match(sql,/LIMIT 25 FOR UPDATE SKIP LOCKED/);
 assert.doesNotMatch(sql,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE)\b/i);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE)\s+(?:public\.)?(?:taphoa_debt_ledger|taphoa_orders|taphoa_order_items|v21_messages)\b/i);
 assert.doesNotMatch(sql,/cron\.unschedule/,'retire cron only after confirming the existing queue was dispatched');
});
