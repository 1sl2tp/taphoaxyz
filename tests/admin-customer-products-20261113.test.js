// SPEC-CARE-ALL-PURCHASES-20261113 · read-only, no session or finance mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCustomerPurchases,sortCustomerPurchases,createCustomerPurchasesReport}
 from '../src/admin-customer-products.js';
const original=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const implementation=readFileSync(new URL('../src/admin-customer-products.js',import.meta.url),'utf8');
const date='2026-11-13';
const orders=[
 {id:'a',maKH:'quyen',status:'done',ngay:'2026-11-10T04:00:00Z',
  items:[{maSP:'A',tenSP:'Sữa chua',sl:2},{maSP:'A',tenSP:'Sữa chua',sl:3},{maSP:'B',tenSP:'Hàng chỉ mua 1 lần',sl:1}]},
 {id:'b',maKH:'quyen',status:'done',ngay:'2026-11-12T04:00:00Z',
  items:[{maSP:'A',tenSP:'Sữa chua',sl:4},{maSP:'C',tenSP:'Cũ',sl:1}]},
 {id:'c',maKH:'quyen',status:'done',ngay:'2026-09-25T04:00:00Z',
  items:[{maSP:'D',tenSP:'Từng mua lâu rồi',sl:3}]},
 {id:'d',maKH:'quyen',status:'pending',ngay:'2026-11-13T00:00:00Z',
  items:[{maSP:'E',tenSP:'Đơn tạm',sl:9}]},
 {id:'e',maKH:'quyen',status:'reversed',ngay:'2026-11-13T00:00:00Z',
  items:[{maSP:'F',tenSP:'Đã hoàn',sl:7}]},
 {id:'g',maKH:'quyen',status:'done',ngay:'2026-11-13T04:00:00Z',
  items:[{maSP:'C',tenSP:'Cũ',sl:1}]},
 {id:'f',maKH:'other',status:'done',ngay:'2026-11-13T00:00:00Z',
  items:[{maSP:'G',tenSP:'Nhà khác',sl:11}]}
];
test('all-time includes each purchased product, even once and old, no draft/reversal/other customer',()=>{
 const rows=summarizeCustomerPurchases(orders,'quyen',{today:date});
 assert.deepEqual(rows.map(x=>x.code).sort(),['A','B','C','D']);
 assert.equal(rows.find(x=>x.code==='A').orders,2);
 assert.equal(rows.find(x=>x.code==='A').qty,9);
 assert.equal(rows.find(x=>x.code==='B').orders,1);
 assert.equal(rows.find(x=>x.code==='D').lastDay,'2026-09-25');
});
test('7/30-day slices use Vietnam delivery day and do not truncate lifetime',()=>{
 assert.deepEqual(summarizeCustomerPurchases(orders,'quyen',{days:7,today:date}).map(x=>x.code).sort(),['A','B','C']);
 assert.deepEqual(summarizeCustomerPurchases(orders,'quyen',{days:30,today:date}).map(x=>x.code).sort(),['A','B','C']);
 assert.equal(summarizeCustomerPurchases(orders,'quyen',{today:date}).length,4);
});
test('frequency/quantity/last purchase sorting all remain deterministic',()=>{
 const rows=summarizeCustomerPurchases(orders,'quyen',{today:date});
 assert.equal(sortCustomerPurchases(rows,'frequency')[0].code,'A');
 assert.equal(sortCustomerPurchases(rows,'quantity')[0].code,'A');
 assert.equal(sortCustomerPurchases(rows,'recent')[0].code,'C');
});
test('admin report integration is explicit and read-only; no auto send or ledger mutation',()=>{
 assert.equal(typeof createCustomerPurchasesReport,'function');
 assert.match(original,/createCustomerPurchasesReport/);
 assert.match(original,/purchases\.show\(productHost,r\.id\)/);
 assert.match(original,/purchases\.reset\(\)/);
 assert.match(implementation,/taphoa_app_domains/);
 assert.match(implementation,/p_domains:\['orders'\]/);
 assert.match(implementation,/getIdentity\(\)\?\.role!=='admin'/);
 assert.doesNotMatch(implementation,/taphoa_save_order|taphoa_debt_transaction|insert into|delete from|sendMessage|setInterval/);
 assert.match(page,/care-product-history/);
});
