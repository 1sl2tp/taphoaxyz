import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const ui=read('src/admin-customer-care-report.js');
const page=read('admin-gia.html');
const sql=read('supabase/migrations/20261024093000_cycle198_sender_voice_switch.sql');
const cycle=read('supabase/migrations/20261024090000_cycle197_personalized_reminders.sql');

test('shared Admin sender does not assume female when recipient is Em',()=>{
 assert.match(sql,/young_customer_speaker text NOT NULL DEFAULT 'anh'/);
 assert.match(sql,/young_customer_speaker IN \('anh','chị'\)/);
 assert.match(sql,/WHEN v_title='Em' THEN v_young ELSE 'em'/);
 assert.match(sql,/speaker','cháu'/);
 assert.match(sql,/vocative/);
 assert.match(sql,/lower\(split_part\(v,' ',1\)\)/);
 assert.match(ui,/from:t==='E'\?youngSpeaker:'em'/);
 assert.match(ui,/return \{name,from:'cháu'\}/);
});

test('automated due and pre-due text use same switch and remain gated',()=>{
 assert.match(cycle,/taphoa_cycle_address\(c\.display_name\)/);
 assert.match(cycle,/taphoa_chat_notify_customer/);
 assert.match(cycle,/v21_private\.taphoa_cycle_payment_pending/);
 assert.match(sql,/taphoa_cycle_sender_voice_setting/);
 assert.match(sql,/taphoa_access_context\(\)/);
 assert.match(sql,/v_ctx->>'taphoa_role' IS DISTINCT FROM 'admin'/);
 assert.match(sql,/REVOKE ALL ON v21_private\.taphoa_cycle_sender_voice FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.taphoa_cycle_sender_voice_setting\(text\)/);
 assert.doesNotMatch(sql,/taphoa_chat_notify_customer\(/);
});

test('Admin care report can switch nam/nu and shows preview without sending',()=>{
 assert.match(ui,/taphoa_cycle_sender_voice_setting/);
 assert.match(ui,/Người xưng hô trong tin nhắn/);
 assert.match(ui,/Nam: anh với Em/);
 assert.match(ui,/Nữ: chị với Em/);
 assert.match(ui,/e\.target\.id!=='careSenderVoice'/);
 assert.match(ui,/setting\?\.young_speaker!==next/);
 assert.match(page,/care-voice-select/);
 assert.match(ui,/Chỉ sao chép, không tự gửi Chat\/Zalo/);
});
