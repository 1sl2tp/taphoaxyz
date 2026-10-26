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
 assert.match(admin,/Trễ 2 ngày/);
 assert.match(admin,/Có thể trao đổi trực tiếp, tránh nhắc liên tục/);
 assert.doesNotMatch(admin,/ngày đến mốc 7/);
 const pending=alert({...base,policyPendingEvidence:true});
 assert.match(pending,/bill chờ đối soát/);
 assert.match(pending,/Ưu tiên kiểm tra chứng từ trước khi liên hệ/);
 assert.doesNotMatch(pending,/ưu tiên liên hệ trực tiếp/);
});

test('monthly period shows distinct purchase days separately from orders, without resetting debt cycles',()=>{
 assert.match(ui,/function currentMonthStats\(row\)/);
 assert.match(ui,/numeric\(month.purchaseDays\)/);
 assert.match(ui,/numeric\(month.orderCount\)/);
 assert.match(ui,/Kỳ mua /);
 assert.match(ui,/Có công nợ từ tháng trước chuyển sang/);
 assert.match(ui,/Xem các kỳ tháng \(6 tháng gần nhất\)/);
 assert.doesNotMatch(ui,/purchaseCount\+' lượt mua'/);
 const source=ui.slice(ui.indexOf('  function currentMonthStats('),ui.indexOf('  function alertText('));
 const vmCtx={numeric:v=>Math.max(0,Number(v)||0),String,Number};
 const obj=vm.runInNewContext(source+'\n({currentMonthStats,monthCountText})',vmCtx);
 const stats=obj.currentMonthStats({monthly:[{month:'2026-10',purchaseDays:1,orderCount:3,carryOver:9}]});
 assert.equal(stats.orderCount,3);
 assert.equal(obj.monthCountText(stats),'Tháng 10/2026 · 1 ngày mua (3 đơn)');
});

test('month-close reminder runs only at month end, never re-sends during F5 or day-7',()=>{
 const sql=load('supabase/migrations/20261026113000_cycle_monthly_reporting_gentle_close.sql');
 assert.match(sql,/count\(distinct \(coalesce\(o.delivered_at,l.created_at\)/);
 assert.match(sql,/count\(distinct l.order_id\)/);
 assert.match(sql,/monthly_json/);
 assert.match(sql,/'monthly',coalesce\(mj.months/);
 assert.match(sql,/IF v_today < v_end-2 OR v_today>v_end THEN RETURN 0/);
 assert.match(sql,/month_start date NOT NULL/);
 assert.match(sql,/PRIMARY KEY\(customer_account_id,month_start\)/);
 assert.match(sql,/msg.client_id LIKE 'taphoa:cycle-%'/);
 assert.match(sql,/msg.created_at >= now\(\)-interval '7 days'/);
 assert.match(sql,/taphoa_cycle_payment_pending\(c.id\)/);
 assert.match(sql,/v_balance<10/);
 assert.match(sql,/Không|không bị xóa hoặc tính là đã thanh toán/);
 assert.match(sql,/v_client_id:='taphoa:month-close:'/);
 assert.match(sql,/v_close:=v21_private.taphoa_send_monthly_close_notices\(\)/);
 assert.doesNotMatch(sql,/v_pre:=v21_private.taphoa_cycle_send_pre_due_notices\(\)/);
 assert.doesNotMatch(sql,/INSERT INTO public.taphoa_debt_ledger/i);
});
