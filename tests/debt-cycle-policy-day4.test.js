import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const ui=read('src/fixed-ui-debt-cycles.js');
const snapshot=read('supabase/migrations/20261024073000_cycle196_policy_snapshot.sql');
const expose=read('supabase/migrations/20261024074000_cycle196_expose_due_in_debt_cycles.sql');
const order=read('supabase/migrations/20261024075000_cycle196_order_notice.sql');
const due=read('supabase/migrations/20261024080000_cycle196_due_notices.sql');
const timing=read('supabase/migrations/20261024081000_cycle196_due_notice_daily_schedule.sql');
const preference=read('supabase/migrations/20261024082000_cycle196_notify_pref_debt_suffix.sql');

test('open cycle debt stays open until fully settled and first missed-buy deadline never resets',()=>{
  assert.match(snapshot,/IF v_balance<=0 THEN RETURN NULL;/);
  assert.match(snapshot,/r\.balance_after>0 AND r\.balance_after-r\.amount_vnd<=0/);
  assert.match(snapshot,/r\.balance_after<=0 AND r\.balance_after-r\.amount_vnd>0/);
  assert.match(snapshot,/g\.buy_day-g\.prior_day>=3/);
  assert.match(snapshot,/min\(g\.prior_day\+3\)/);
  assert.match(snapshot,/least\(coalesce\(v_first_gap,v_last\+3\),v_last\+3\)/);
  assert.match(snapshot,/v_seven_due:=v_start\+6/);
  assert.match(snapshot,/v_due:=least\(v_seven_due,v_stop_due\)/);
  assert.match(snapshot,/greatest\(0,v_today-v_due\)/);
  assert.match(expose,/policyFirstGapDay/);
  assert.match(expose,/policyDaysOverdue/);
  assert.match(expose,/policyIsDue/);
  assert.doesNotMatch(snapshot,/\b(update|delete|insert)\s+(?:into\s+|from\s+)?public\.taphoa_debt_ledger\b/i);
});

test('new delivered order receipt carries cycle start or continuing-cycle policy, but edits do not',()=>{
  assert.match(snapshot,/firstOrderId/);
  assert.match(snapshot,/BẮT ĐẦU CHU KỲ NỢ/);
  assert.match(snapshot,/Đơn mua tiếp không gia hạn mốc 7 ngày/);
  assert.match(snapshot,/Mua thêm không xóa hạn thanh toán cũ/);
  assert.match(order,/v_edit_id is null or \(v_old_status='pending' and v_status='delivered'\)/);
  assert.match(order,/v21_private\.taphoa_order_cycle_policy_note\(v_customer,v_order\.id\)/);
});

test('day-four and day-seven notifications honor preferences and never spam historic cycles',()=>{
  assert.match(due,/v21_private\.taphoa_cycle_policy_snapshot\(v_customer\.id\)/);
  assert.match(due,/v_due<date '2026-10-24'/);
  assert.match(due,/taphoa_cycle_due_notice_log/);
  assert.match(due,/PRIMARY KEY\(customer_account_id,cycle_start_day\)/);
  assert.match(due,/pg_advisory_xact_lock/);
  assert.match(due,/IF v_message IS NOT NULL THEN/);
  assert.match(due,/taphoa_chat_notify_customer/);
  assert.match(preference,/\|\|':debt'/);
  assert.match(timing,/0 1 \* \* \*/);
  assert.match(timing,/taphoa_cycle_send_due_notices/);
});

test('customer debt cards prioritize missed-purchase due over unused seven-day allowance',()=>{
  const a=ui.indexOf('function alertText(cycle){');
  const b=ui.indexOf('function currentSignature(){',a);
  assert(a>=0&&b>a);
  const context={numeric:value=>Math.max(0,Number(value)||0)};
  const format=vm.runInNewContext(ui.slice(a,b)+'\nalertText',context);
  const dueNow=format({durationDays:4,daysWithoutPurchase:3,policyDueDay:'2026-10-24',
    policyReason:'stopped_buying',policyDaysOverdue:0,policyIsDue:true});
  assert.match(dueNow,/Đã ngừng mua 3 ngày/);
  assert.match(dueNow,/Hết thời gian hỗ trợ/);
  assert.match(dueNow,/ngay hôm nay/);
  assert.doesNotMatch(dueNow,/Còn 3 ngày đến mốc 7/);
  const late=format({durationDays:5,daysWithoutPurchase:4,policyDueDay:'2026-10-24',
    policyReason:'stopped_buying',policyDaysOverdue:1,policyIsDue:true});
  assert.match(late,/Quá hạn 1 ngày/);
  const resumed=format({durationDays:6,daysWithoutPurchase:1,policyDueDay:'2026-10-24',
    policyFirstGapDay:'2026-10-24',policyReason:'stopped_buying',policyDaysOverdue:2,policyIsDue:true});
  assert.match(resumed,/Đã từng ngừng mua đủ 3 ngày/);
  assert.match(resumed,/Quá hạn 2 ngày/);
  const active=format({durationDays:2,daysWithoutPurchase:1,policyDueDay:'2026-10-25',
    policyIsDue:false});
  assert.match(active,/Còn 2 ngày đến mốc ngừng mua/);
});
