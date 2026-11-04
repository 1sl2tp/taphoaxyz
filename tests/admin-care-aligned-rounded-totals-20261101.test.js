import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=code.indexOf('  // SPEC-ADMIN-CARE-ROUND-TOTALS-20261101:');
const end=code.indexOf("  const day=v=>",start);
assert.ok(start>=0&&end>start);

const context=vm.createContext({});
vm.runInContext(code.slice(start,end)+'\nglobalThis.format={amount,number,percent};',context);
const {amount,number,percent}=context.format;

test('whole-unit totals round half up without changing decimal unit prices elsewhere',()=>{
 assert.equal(amount(1807304.5),'1.807.305');
 assert.equal(amount(49622.5),'49.623');
 assert.equal(amount(1856927),'1.856.927');
 assert.equal(amount(630.49),'630');
 assert.equal(amount(630.5),'631');
 assert.equal(amount(-49622.5),'-49.623');
});
test('missing totals remain missing; zero remains zero; percentages keep two decimals',()=>{
 assert.equal(amount(null),'—');
 assert.equal(amount(undefined),'—');
 assert.equal(amount(''),'—');
 assert.equal(amount('not-a-number'),'—');
 assert.equal(amount(0),'0');
 assert.equal(percent(2.674),'2,67%');
 assert.equal(number(1807304.5),'1.807.304,5');
});
test('all customer finance amounts use the rounded formatter; counts and percentages do not',()=>{
 assert.match(code,/\$\('careSystemRevenue'\)\.textContent=amount\(totals\.revenue\)/);
 assert.match(code,/\$\('careSystemCost'\)\.textContent=[^\n]*amount\(totals\.cost\)/);
 assert.match(code,/\$\('careSystemProfit'\)\.textContent=Number\(totals\.missing_cost_lines\)>0\?'Chưa đủ giá vốn':amount\(totals\.gross_profit\)/);
 assert.match(code,/const balance=Number\(r\.debt_balance\)<0\?'Dư '\+amount/);
 assert.match(code,/amount\(r\.total_revenue\)/);
 assert.match(code,/amount\(r\.period_collected\)/);
 assert.match(code,/const percent=v=>/);
});
test('eight period and lifetime status cards are arranged in balanced rows with responsive layout',()=>{
 assert.match(html,/class="analytics-cards care-overview-cards"/);
 assert.match(html,/#customerCarePane \.care-overview-cards\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:760px\)\{\s*#customerCarePane \.care-overview-cards\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/#customerCarePane \.care-list td\.num\{\s*text-align:right/);
 assert.match(html,/#customerCarePane \.care-finance-cards>div\{\s*display:grid;grid-template-rows/);
});
