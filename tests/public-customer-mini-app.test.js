import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8').toLowerCase();
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8').toLowerCase();
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8').toLowerCase();
const runtime=fs.readFileSync(new URL('../src/fixed-ui-runtime-4.js',import.meta.url),'utf8').toLowerCase();
const css=fs.readFileSync(new URL('../src/fixed-ui-source-4.css',import.meta.url),'utf8').toLowerCase();
const optionalPin=fs.readFileSync(new URL('../supabase/migrations/20260922184409_public_link_optional_self_pin.sql',import.meta.url),'utf8').toLowerCase();
const gateway=fs.readFileSync(new URL('../supabase/migrations/20260923020000_public_user_ui_gateway.sql',import.meta.url),'utf8').toLowerCase();

test('customer link offers self-created PIN, skip, and account login',()=>{
  for(const needle of [
    'taphoa_public_gate_state',
    'taphoa_public_pin_create',
    "sessionstorage.setitem(store",
    'tạo pin',
    'bỏ qua',
    'đăng nhập',
    'chưa được bảo vệ bằng pin'
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
    "taphoa_public_bootstrap_access",
    "taphoa_public_domains_access",
    "taphoa_public_save_pending_access",
    "taphoa_public_delete_pending_access",
    "taphoa_public_order_detail_access",
    "taphoa_public_debt_ledger_access",
    "getaccessmode:()=>publicaccess?'public-link':'account'"
  ])assert.ok(bridge.includes(needle),needle);

  for(const needle of [
    'openpublicuserfromsession',
    'const restored=await backend().restore()',
    "backend().openpubliclink(q.kh,'')",
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
    'border-radius:16px',
    '-webkit-tap-highlight-color:transparent',
    'background:rgba(255,255,255,.14)',
    'body[data-employee-mode="true"] #headerquicktotal',
    'body[data-employee-mode="true"] #btnopencartmobile'
  ])assert.ok(css.includes(needle),needle);

  for(const needle of [
    'function syncpublictoolstate()',
    "bar.dataset.publictoolview='hang'",
    "bar.dataset.publictoolview!=='hang'",
    'requestanimationframe(()=>renderproductlist())',
    "employeebutton.textcontent=employee?'chủ':'nhân viên'",
    "const url=string(links?.employee_url||'')",
    "await copypublictext(url,'đã copy link nv')"
  ])assert.ok(overrides.includes(needle),needle);
});

test('optional PIN access keeps link possession open until PIN is created and lets account auth bypass it',()=>{
  for(const needle of [
    'pin_hash bytea',
    'taphoa_public_gate_state',
    'taphoa_public_pin_create',
    'taphoa_public_customer_id_for_access',
    "v_account.role='admin'",
    'v_account.id=v_link.customer_account_id',
    'if v_link.pin_hash is null then',
    'extensions.digest',
    'taphoa_public_bootstrap_access',
    'taphoa_public_save_pending_access'
  ])assert.ok(optionalPin.includes(needle),needle);

  for(const needle of [
    'taphoa_public_bootstrap_for_customer',
    'taphoa_public_domains_for_customer',
    'taphoa_public_save_pending_order',
    'taphoa_public_delete_pending_order'
  ])assert.ok(gateway.includes(needle),needle);
});
