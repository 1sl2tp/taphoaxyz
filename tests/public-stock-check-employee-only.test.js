import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate=fs.readFileSync(new URL('../kiemhang/index.html',import.meta.url),'utf8').toLowerCase();
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8').toLowerCase();
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8').toLowerCase();
const css=fs.readFileSync(new URL('../src/fixed-ui-source-4.css',import.meta.url),'utf8').toLowerCase();

test('employee link is only a PIN gate that hands off to the real app UI',()=>{
  for(const needle of [
    'nhập mã pin',
    'chủ cửa hàng chưa tạo pin',
    'x-employee-pin',
    "sessionstorage.setitem(store,json.stringify({token,pin:value}))",
    "location.replace('/?employee=1&t='",
  ])assert.ok(gate.includes(needle),needle);

  for(const forbidden of [
    'gửi kiểm hàng',
    'xóa / nhập lại',
    'data-delta="-1"',
    'data-delta="1"',
    'sale_price_vnd',
    '>chủ<',
    '>gửi link<'
  ])assert.equal(gate.includes(forbidden),false,forbidden);
});

test('real app has a scoped employee-link access mode with no owner privilege path',()=>{
  for(const needle of [
    'let employeeaccess=null',
    'async function openemployeelink(token,pin)',
    'async function saveemployeequantities(items=[])',
    "getaccessmode:()=>employeeaccess?'employee-link':publicaccess?'public-link':'account'",
    'employeestatefromsnapshot',
    "throw new error('employee_read_only')"
  ])assert.ok(bridge.includes(needle),needle);

  for(const needle of [
    'async function openemployeelinkfromsession()',
    'async function enteremployeelink(info)',
    "window.taphoa_employee_mode=true",
    "document.body.dataset.employeelink='true'",
    'installsharedcartquantitysync()',
    'schedulesharedcartsave()',
    'backend().savesharedquantities(items)',
    'sessionstorage.removeitem(employee_link_session_key)'
  ])assert.ok(overrides.includes(needle),needle);

  for(const needle of [
    'body[data-employee-link="true"] #statusbar',
    'body[data-employee-mode="true"] #topnav .tab-btn:not(:first-child)',
    'body[data-employee-mode="true"] #headerquicktotal',
    'body[data-employee-mode="true"] #btnopencartmobile'
  ])assert.ok(css.includes(needle),needle);
});
