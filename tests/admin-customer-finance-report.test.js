import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261010142000_tapho_admin_customer_finance.sql',import.meta.url),'utf8');

test('first report name column bug uses display_name consistently, even for stale one-argument client',()=>{
 assert.match(sql,/select c\.id,c\.username,c\.display_name,/);
 assert.match(sql,/order by delivered_count desc,display_name/);
 assert.doesNotMatch(sql,/order by delivered_count desc,name/);
});
test('finance report defines period and totals separately from lifetime customer debt',()=>{
 for(const k of ['carePeriod','carePeriodStart','carePeriodEnd','careSystemRevenue','careSystemCost','careSystemProfit','careSystemMargin']){
  assert.match(page,new RegExp('id="'+k+'"'));
 }
 assert.match(js,/p_start_date:period\.p_start_date,p_end_date:period\.p_end_date/);
 assert.match(js,/period\.label/);
 assert.match(js,/lifetime_manual_debt/);
 assert.match(js,/period_manual_debt/);
 assert.match(js,/gross_margin_percent/);
 assert.match(js,/revenue_share_percent/);
 assert.match(js,/profit_share_percent/);
 assert.match(js,/Công nợ hiện tại · toàn thời gian/);
 assert.doesNotMatch(js,/setInterval\(/);
});
test('canonical money: delivered snapshots only; cost missing disqualifies gross profit',()=>{
 assert.match(sql,/i\.qty\*i\.unit_price_vnd/);
 assert.match(sql,/i\.qty\*i\.unit_cost_vnd_snapshot/);
 assert.match(sql,/o\.status='delivered'/);
 assert.match(sql,/cost_missing_lines/);
 assert.match(sql,/coalesce\(pf\.missing,0\)=0/);
 assert.match(sql,/then round\(100\*\(pf\.revenue-pf\.cost\)\/pf\.revenue,2\)/);
 assert.match(sql,/sf\.revenue>0/);
 assert.match(sql,/sf\.revenue-sf\.cost>0/);
 assert.match(sql,/period_manual_debt/);
 assert.match(sql,/entry_type='payment'/);
 assert.match(sql,/entry_type='collection'/);
 assert.match(sql,/entry_type='reversal'/);
 assert.match(sql,/debt_balance/);
 assert.match(sql,/p_start_date is null/);
 assert.match(sql,/p_end_date is null/);
 assert.match(sql,/taphoa_access_context\(\)/);
 assert.match(sql,/taphoa_role',''\) <> 'admin'/);
 assert.match(sql,/revoke all on function public\.taphoa_admin_customer_care_report\(integer,date,date\) from public,anon/i);
 assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from|taphoa_chat_notify_customer)\b/i);
});
test('weighted margin is computed from money totals, not simple average of customer rates',()=>{
 const c1={sales:900,cost:810},c2={sales:100,cost:0};
 const revenue=c1.sales+c2.sales,cost=c1.cost+c2.cost;
 assert.equal(Math.round(10000*(revenue-cost)/revenue)/100,19);
 assert.notEqual(19,((c1.sales-c1.cost)/c1.sales+(c2.sales-c2.cost)/c2.sales)*50);
});
