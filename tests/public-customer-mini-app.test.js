import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8').toLowerCase();
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8').toLowerCase();
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8').toLowerCase();
const runtime=fs.readFileSync(new URL('../src/fixed-ui-runtime-4.js',import.meta.url),'utf8').toLowerCase();
const css=fs.readFileSync(new URL('../src/fixed-ui-source-4.css',import.meta.url),'utf8').toLowerCase();
const pinRpc=fs.readFileSync(new URL('../supabase/migrations/20260923021000_public_user_pin_rpc.sql',import.meta.url),'utf8').toLowerCase();
const gateway=fs.readFileSync(new URL('../supabase/migrations/20260923020000_public_user_ui_gateway.sql',import.meta.url),'utf8').toLowerCase();

test('customer link is only a PIN gateway into the existing User UI',()=>{
  for(const needle of [
    'taphoa_public_pin_check',
    "sessionstorage.setitem(store",
    "location.replace(rooturl())",
    'pin gồm 6 chữ số',
    'nhập mã pin'
  ])assert.ok(gate.includes(needle),needle);

  for(const forbidden of [
    'v21-quote',
    'taphoa-public-debt',
    'data-stock-footer',
    'data-stock-order',
    'data-tab="hang"',
    'data-tab="don"',
    'data-tab="no"',
    'gửi kiểm hàng'
  ])assert.equal(gate.includes(forbidden),false,forbidden);
});

test('public customer access reuses the production bridge and existing User screens',()=>{
  for(const needle of [
    'async function openpubliclink',
    "taphoa_public_bootstrap_by_pin",
    "taphoa_public_domains_by_pin",
    "taphoa_public_save_pending_by_pin",
    "taphoa_public_delete_pending_by_pin",
    "taphoa_public_order_detail_by_pin",
    "taphoa_public_debt_ledger_by_pin",
    "getaccessmode:()=>publicaccess?'public-link':'account'"
  ])assert.ok(bridge.includes(needle),needle);

  for(const needle of [
    'openpublicuserfromsession',
    "setauthrole('user')",
    'showappscreen()',
    'applypublicdeeplink()',
    'public-user-tool',
    '>đã mua</button>',
    '>gợi ý</button>',
    '>nhân viên</button>',
    '>gửi link</button>',
    'startpublicemployeesync',
    'backend().employeesnapshot()'
  ])assert.ok(overrides.includes(needle),needle);
});

test('bought suggested and employee modes are thin filters on the existing product renderer',()=>{
  for(const needle of [
    "window.taphoa_product_segment",
    "segment === 'bought'",
    "segment === 'suggested'",
    'market_customer_count',
    'window.taphoa_employee_mode',
    "const employeemode = boolean(window.taphoa_employee_mode)"
  ])assert.ok(runtime.includes(needle),needle);

  for(const needle of [
    '.public-user-tools',
    'body[data-employee-mode="true"] #headerquicktotal',
    'body[data-employee-mode="true"] #btnopencartmobile'
  ])assert.ok(css.includes(needle),needle);
});

test('PIN wrappers are the public security boundary for User data and draft mutations',()=>{
  for(const needle of [
    'taphoa_public_customer_id_by_pin',
    'taphoa_public_bootstrap_by_pin',
    'taphoa_public_domains_by_pin',
    'taphoa_public_save_pending_by_pin',
    'taphoa_public_delete_pending_by_pin',
    'taphoa_public_employee_link_by_pin',
    'taphoa_public_employee_snapshot_by_pin'
  ])assert.ok(pinRpc.includes(needle),needle);

  for(const needle of [
    'taphoa_public_bootstrap_for_customer',
    'taphoa_public_domains_for_customer',
    'taphoa_public_save_pending_order',
    'taphoa_public_delete_pending_order'
  ])assert.ok(gateway.includes(needle),needle);
});
