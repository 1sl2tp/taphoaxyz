import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const report=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
test('buyers explicitly count distinct customers, not delivered orders',()=>{
 const card=page.match(/<div class="analytics-card"[^>]*><span>Khách mua · không trùng<\/span><strong id="careBought">—<\/strong><\/div>/)?.[0];
 assert.ok(card,'buyer card should clarify unique customer semantics');
 assert.match(card,/một; đơn tạm chưa giao không tính/);
 assert.match(report,/khách mua khác nhau · '\+number\(periodSummary\.orders\)\+' đơn đã giao/);
 assert.match(report,/customers\.filter\(r=>Number\(r\.period_delivered_count\)>0\)\.length/);
});
test('order card retains the total delivered-order count',()=>{
 assert.match(page,/Một khách có thể có nhiều đơn/);
 assert.match(report,/orders:Number\.isFinite\(systemOrders\)\?systemOrders:rosterOrders/);
});
