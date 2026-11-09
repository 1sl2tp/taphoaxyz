import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bridge=read('src/fixed-production-bridge.js');
const shared=read('src/fixed-ui-runtime-7.js');
const draft=read('src/fixed-ui-runtime-10.js');
const delivered=read('src/fixed-ui-runtime-11.js');
const cart=read('src/fixed-ui-runtime-12.js');
const details=read('src/fixed-ui-runtime-13.js');
const id='b751ad8b-9905-4837-9ac9-a8c39d287bfa';

const start=bridge.indexOf('function mapOrderRows(kind,state=');
const end=bridge.indexOf('\nfunction debtBalance(',start);
assert.ok(start>=0&&end>start,'one canonical order projection');

function simulateProjection(orders){
 const context=vm.createContext({});
 const prelude=[
  "const text=value=>String(value??'');",
  "const num=value=>Number.isFinite(Number(value))?Number(value):0;",
  "const first=(obj,keys,fallback='')=>{for(const key of keys)if(obj&&obj[key]!==undefined&&obj[key]!==null&&obj[key]!=='')return obj[key];return fallback;};",
  "const orderStatus=order=>text(first(order,['trangThai','status'])).toLowerCase();",
  "const orderCustomer=order=>text(first(order,['maKH','customer_id','customerId'],'le'))||'le';",
  "const orderDisplayCode=order=>text(first(order,['displayCode','display_code','maDon']));",
  "const backendOrderId=order=>text(first(order,['backendOrderId','order_id','id']));",
  "const orderTime=()=> '09/11/2026 08:29:02';"
 ].join('\n');
 vm.runInContext(prelude+'\n'+bridge.slice(start,end)+'\nglobalThis.getRows=mapOrderRows;',context);
 return kind=>context.getRows(kind,{orders});
}

const helperStart=shared.indexOf('function resolveSavedOrderCustomerName(');
const helperEnd=shared.indexOf('\n        // SPEC-TAPHOA-USER-PIN-ORDER-TIMELINE',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'one shared display helper');
const helper=vm.createContext({});
vm.runInContext(shared.slice(helperStart,helperEnd)+'\nglobalThis.resolve=resolveSavedOrderCustomerName;',helper);

test('DT218 shows the saved real buyer when customer-domain data is not yet loaded',()=>{
 const orders=[{
  status:'pending',maKH:id,tenKH:'co ha truong',maDon:'DT218',backendOrderId:'order-218',displayNo:218,
  items:[
   {maSP:'HT-000001',sl:5,gia:100,unit_cost:88,ghiChu:'Có ghi chú'},
   {maSP:'HT-000002',sl:5,gia:1000,unit_cost:900},
   {maSP:'HT-000003',sl:5,gia:566,unit_cost:500}
  ]
 }];
 const rows=simulateProjection(orders)('dontam');
 assert.equal(rows.length,4,'header + 3 order lines');
 assert.equal(rows[0][11],'Tên KH theo đơn');
 assert.ok(rows.slice(1).every(row=>row[0]==='DT218'&&row[1]===id));
 assert.ok(rows.slice(1).every(row=>row[11]==='co ha truong'));
 assert.equal(rows.slice(1).reduce((sum,row)=>sum+Number(row[5]),0),8330,'amount unchanged');
 assert.equal(rows[1][9],'Có ghi chú','note retained');
 assert.equal(rows[1][10],'88','cost snapshot untouched');
 assert.equal(helper.resolve(rows[1]),'co ha truong');
});

test('current contact name wins over older saved order name without changing buyer ID',()=>{
 const row=['DT218',id,null,5,100,500,'09/11/2026 08:29:02',null,218,null,null,'co ha truong'];
 assert.equal(helper.resolve(row,'Cô Hà Trương'),'Cô Hà Trương');
 assert.equal(row[1],id,'immutable customer ID never overwritten');
 assert.equal(helper.resolve(row,id),'co ha truong','UUID from stale contacts is not a name');
});

test('legacy rows with no name never display raw UUID as a buyer',()=>{
 assert.equal(helper.resolve(['DT218',id]),'Khách hàng chưa có tên');
 assert.equal(helper.resolve(['DT218',id],' '),'Khách hàng chưa có tên');
 assert.equal(helper.resolve(['DT1','KH-007']),'KH-007','legacy non-UUID keys still usable');
});

test('draft, delivered, detail and edit all use one escaped display name resolution',()=>{
 assert.match(draft,/tenKh:\s*resolveSavedOrderCustomerName\(r,\s*khDict\[maKh\]\)/);
 assert.match(delivered,/tenKh:\s*resolveSavedOrderCustomerName\(r,\s*khDict\[maKh\]\)/);
 assert.match(cart,/name:\s*resolveSavedOrderCustomerName\(items\[0\],\s*kh\?\.\[1\]\)/);
 assert.match(details,/detailModalKH'\)\.innerText\s*=\s*resolveSavedOrderCustomerName\(items\[0\],\s*kh\?\.\[1\]\)/);
 assert.ok(draft.includes('escapeProductEditorValue(o.tenKh)'));
 assert.ok(delivered.includes('escapeProductEditorValue(o.tenKh)'));
});

test('order positional columns, price and cart semantics stay unchanged',()=>{
 const code=bridge.slice(start,end);
 assert.match(code,/time,backendId,displayNo,note,String\(costSnapshot\),customerName/);
 assert.match(cart,/cart\[maSp\]\s*=\s*\{\s*name:\s*spDict\[maSp\]/);
 assert.match(details,/const tenSpSafe = escapeProductEditorValue\(tenSp\)/);
 assert.match(details,/Math\.round\(total\)\.toLocaleString\('vi-VN'\)/);
});
