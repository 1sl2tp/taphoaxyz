// SPEC-CARE-PURCHASE-GROUPS-20261113
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {purchaseGroup,summarizeCustomerPurchases,groupCustomerPurchases}
  from '../src/admin-customer-products.js';
const source=readFileSync(new URL('../src/admin-customer-products.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const orders=[
 {id:'a',maKH:'e-quyen',status:'done',ngay:'2026-11-10T06:00:00Z',
  items:[
   {maSP:'SUA-001',tenSP:'Sữa chua',nhom:'Sữa',sl:3},
   {maSP:'SUA-001',tenSP:'Sữa chua',nhom:'sua',sl:2},
   {maSP:'HU-005',tenSP:'Nước giặt',nhom:'hang-u',sl:1},
   {maSP:'EX-1',tenSP:'Hàng lạ',nhom:'do-kho',sl:2}
  ]},
 {id:'b',maKH:'e-quyen',status:'done',ngay:'2026-11-11T06:00:00Z',
  items:[
   {maSP:'SUA-001',tenSP:'Sữa chua',sl:2},
   {maSP:'HT-009',tenSP:'Mì gói',sl:8}
  ]},
 {id:'c',maKH:'e-quyen',status:'done',ngay:'2026-09-20T06:00:00Z',
  items:[{maSP:'TL-010',tenSP:'Mềm',sl:5}]},
 {id:'d',maKH:'e-quyen',status:'pending',ngay:'2026-11-12T06:00:00Z',
  items:[{maSP:'SUA-999',tenSP:'Đơn tạm',sl:40}]},
 {id:'e',maKH:'e-quyen',status:'reversed',ngay:'2026-11-12T06:00:00Z',
  items:[{maSP:'HU-999',tenSP:'Đơn hoàn',sl:12}]},
 {id:'f',maKH:'different',status:'done',ngay:'2026-11-12T06:00:00Z',
  items:[{maSP:'HT-444',tenSP:'Khách khác',sl:2}]}
];
test('group names follow original source and legacy prefix; unknown sources remain separate',()=>{
 assert.deepEqual(purchaseGroup({nhom:'Sữa',maSP:'SUA-001'}),{key:'sua',label:'Sữa',fromSource:true});
 assert.equal(purchaseGroup({product_group:'hang-thuong'}).label,'Hàng thường');
 assert.equal(purchaseGroup({nhom:'hang-u'}).label,'Hàng U');
 assert.equal(purchaseGroup({nhom:'thuoc-la'}).label,'Thuốc lá');
 assert.equal(purchaseGroup({nhom:'masan'}).label,'Hàng Masan');
 assert.equal(purchaseGroup({maSP:'TL-010'}).key,'thuoc-la');
 assert.equal(purchaseGroup({maSP:'SUA-010'}).key,'sua');
 assert.equal(purchaseGroup({maSP:'HU-010'}).key,'hang-u');
 assert.equal(purchaseGroup({maSP:'HT-010'}).key,'hang-thuong');
 assert.deepEqual(purchaseGroup({nhom:'do-kho',maSP:'EX-1'}),{key:'do-kho',label:'do kho',fromSource:true});
 assert.equal(purchaseGroup({maSP:'ZZ-1'}).label,'Chưa phân nhóm');
});
test('grouped report keeps lifetime one-time and old items, prevents duplicate order counting',()=>{
 const items=summarizeCustomerPurchases(orders,'e-quyen',{today:'2026-11-13'});
 assert.equal(items.length,5);
 const milk=items.find(x=>x.code==='SUA-001');
 assert.equal(milk.orders,2);
 assert.equal(milk.qty,7);
 assert.equal(milk.groupName,'Sữa');
 assert.equal(items.find(x=>x.code==='HU-005').orders,1);
 assert.equal(items.find(x=>x.code==='TL-010').groupName,'Thuốc lá');
 assert.equal(items.find(x=>x.code==='HT-009').groupName,'Hàng thường');
 const groups=groupCustomerPurchases(items);
 assert.deepEqual(groups.map(x=>x.key),['sua','hang-thuong','hang-u','thuoc-la','do-kho']);
 assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),items.length);
 assert.deepEqual(groupCustomerPurchases(items,{group:'hang-u'}).map(x=>x.rows.map(y=>y.code)),[['HU-005']]);
});
test('7-day frequent slice preserves full lifetime group catalog and one-off classifications',()=>{
 const recent=summarizeCustomerPurchases(orders,'e-quyen',{days:7,today:'2026-11-13'});
 const all=summarizeCustomerPurchases(orders,'e-quyen',{today:'2026-11-13'});
 assert.equal(recent.length,4);
 assert.equal(all.length,5);
 assert.equal(recent.filter(r=>r.orders>=2).length,1);
 assert.equal(all.filter(r=>r.orders===1).length,4);
 assert.equal(groupCustomerPurchases(all,{group:'thuoc-la'}).length,1);
 assert.equal(groupCustomerPurchases(recent,{group:'thuoc-la'}).length,0);
});
test('rendering has a shared group selector and headings for frequent and lifetime products',()=>{
 assert.match(source,/groupControl\.setAttribute\('aria-label','Lọc nhóm hàng đã mua'\)/);
 assert.match(source,/groupCustomerPurchases\(\s*summarizeCustomerPurchases/);
 assert.match(source,/groupCustomerPurchases\(filtered,\{sort\}\)/);
 assert.match(source,/rowsInto\(repeatedArea,repeat,15\)/);
 assert.match(source,/rowsInto\(allArea,matches,expanded\?Infinity:40\)/);
 assert.match(source,/showAllBtn\.hidden=expanded\|\|filtered\.length<=40/);
 assert.match(page,/care-purchase-group-heading/);
 assert.match(page,/care-purchase-group-select/);
 assert.doesNotMatch(source,/taphoa_save_order|taphoa_debt_transaction|setInterval\(/);
});
