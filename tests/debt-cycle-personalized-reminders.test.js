import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=load('supabase/migrations/20261024090000_cycle197_personalized_reminders.sql');
const addressFix=load('supabase/migrations/20261024091000_cycle197_address_pronoun_and_all_pending.sql');
const flagSql=load('supabase/migrations/20261024092000_cycle197_admin_payment_evidence_flag.sql');
const ui=load('src/fixed-ui-debt-cycles.js');

test('A C E and Cô Chú Bác are personalized respectfully and preserve customer voice',()=>{
 assert.match(sql,/taphoa_cycle_address\(p_name text\)/);
 assert.match(sql,/Anh /);
 assert.match(sql,/Chị /);
 assert.match(sql,/Em /);
 assert.match(sql,/Cô|cô/);
 assert.match(addressFix,/cô\|chú\|bác/);
 assert.match(addressFix,/speaker',\s*'cháu'/);
 assert.match(addressFix,/vocative/);
 assert.match(addressFix,/v_role='Em' THEN 'chị' ELSE 'em'/);
 assert.match(sql,/taphoa_cycle_send_pre_due_notices\(\)/);
 assert.match(sql,/taphoa_cycle_send_due_notices\(\)/);
 assert.match(sql,/taphoa_chat_notify_customer/);
});

test('all unresolved customer evidence blocks automatic reminders; never match unknown bank cash by guess',()=>{
 assert.match(addressFix,/chat_bank_bill_receipts/);
 assert.match(addressFix,/r\.customer_account_id=p_customer/);
 assert.match(addressFix,/r\.ledger_id IS NULL/);
 assert.match(addressFix,/r\.status IN \('amount_read','review'\)/);
 assert.match(sql,/v21_private\.taphoa_cycle_payment_pending\(c\.id\)/);
 assert.doesNotMatch(addressFix,/taphoa_agribank_notifications/);
 assert.match(flagSql,/policyPendingEvidence/);
});

test('pre-due and due go via explicit :debt opt in, each only once per cycle',()=>{
 assert.match(sql,/v_due<>v_day\+1/);
 assert.match(sql,/v_due<date '2026-10-25'/);
 assert.match(sql,/v_due<date '2026-10-24'/);
 assert.match(sql,/taphoa_cycle_pre_due_notice_log/);
 assert.match(sql,/taphoa_cycle_due_notice_log/);
 assert.match(sql,/PRIMARY KEY \(customer_account_id,cycle_start_day\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/IF v_msg IS NOT NULL THEN/);
 assert.equal((sql.match(/\|\|':debt'/g)||[]).length,2);
 assert.match(sql,/taphoa_cycle_send_daily_reminders/);
 assert.match(sql,/0 1 \* \* \*/);
 assert.doesNotMatch(sql,/INSERT INTO public\.taphoa_debt_ledger/i);
});

test('admin debt warnings highlight 2+ overdue and distinguish pending bill',()=>{
 const a=ui.indexOf('function alertText(cycle){');
 const b=ui.indexOf('function currentSignature(){',a);
 assert(a>=0&&b>a);
 const alert=vm.runInNewContext(ui.slice(a,b)+'\nalertText',
  {numeric:x=>Math.max(0,Number(x)||0)});
 const base={durationDays:7,daysWithoutPurchase:3,policyDueDay:'2026-10-24',
  policyIsDue:true,policyReason:'stopped_buying',policyDaysOverdue:2};
 const admin=alert(base);
 assert.match(admin,/Quá hạn 2 ngày/);
 assert.match(admin,/Admin ưu tiên liên hệ trực tiếp/);
 assert.doesNotMatch(admin,/ngày đến mốc 7/);
 const pending=alert({...base,policyPendingEvidence:true});
 assert.match(pending,/bill chờ đối soát/);
 assert.match(pending,/Admin kiểm tra trước khi nhắc/);
 assert.doesNotMatch(pending,/ưu tiên liên hệ trực tiếp/);
});
