// SPEC-DEBT-CHAT-ZALO-ACK-20261104 — read-only test doubles, no network or real customer messages.
// E0 owner: TAPHOA debt modal -> manualShareDebt RPC. PNG and Zalo have separate delivery gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/fixed-ui-runtime-12.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../src/fixed-production-bridge.js', import.meta.url), 'utf8');
const business = fs.readFileSync(new URL('../src/core/business.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/migrations/20261104040000_taphoa_manual_debt_chat_without_zalo_requirement.sql', import.meta.url), 'utf8');
const begin = source.indexOf('async function shareCustomerDebtImage(');
const finish = source.indexOf('function requestClearSheet(', begin);
assert.ok(begin >= 0 && finish > begin, 'canonical debt share handler must be found');
const handler = source.slice(begin, finish);
const customerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const requestId = '11111111-2222-4333-8444-555555555555';

function fixture({mode = 'account', role = 'admin', response = {ok: true, message_id: 'chat-message-1'}, failure = null} = {}) {
  const calls = [], toasts = [], alerts = [], saves = [];
  let pngCaptures = 0;
  const prod = {
    getAccessMode: () => mode,
    getIdentity: () => ({role}),
    manualShareDebt: async (...args) => {
      calls.push(args);
      if (failure) throw failure;
      return response;
    },
  };
  const sandbox = {
    window: {
      TAPHOA_PRODUCTION: prod,
      TAPHOA_IMAGE_SAVE: {savePng: (...args) => {saves.push(args); return 'download';}},
    },
    activeDebtCustomerId: customerId,
    crypto: {randomUUID: () => requestId},
    showToast: (...args) => toasts.push(args),
    showAlertPopup: (...args) => alerts.push(args),
    createCustomerDebtPngBlob: () => {
      pngCaptures++;
      return Promise.resolve({type: 'image/png', marker: 'fake-local-png'});
    },
    navigator: {},
  };
  vm.runInNewContext(handler + '\nglobalThis.__share = shareCustomerDebtImage;', sandbox, {timeout: 1000});
  return {share: sandbox.__share, calls, toasts, alerts, saves, pngCaptures: () => pngCaptures};
}

test('one explicit admin Send invokes only the exact customer and a fresh request ID', async () => {
  const f = fixture();
  await f.share('send');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], customerId);
  assert.equal(f.calls[0][1], requestId);
  assert.equal(f.pngCaptures(), 0, 'Chat text ACK is not a PNG attachment');
  assert.equal(f.saves.length, 0);
  assert.match(f.toasts[0][0], /Chưa xác nhận gửi qua Zalo/);
  assert.equal(f.alerts.length, 0);
});

test('non-admin and public-link contexts never invoke sending RPC', async () => {
  for (const opts of [{role:'user'}, {mode:'public-link'}, {mode:'employee-link'}]) {
    const f = fixture(opts);
    await f.share('send');
    assert.equal(f.calls.length, 0);
    assert.equal(f.toasts.length, 0);
    assert.equal(f.pngCaptures(), 0);
    assert.match(f.alerts[0][1], /Không có tin nhắn nào được gửi/);
  }
});

test('duplicate cooldown is not a second send or a delivery confirmation', async () => {
  const f = fixture({response:{ok:false, reason:'recently_sent'}});
  await f.share('send');
  assert.equal(f.calls.length, 1);
  assert.equal(f.alerts.length, 0);
  assert.match(f.toasts[0][0], /Không gửi lại/);
  assert.equal(f.pngCaptures(), 0);
});

test('ambiguous RPC failure does not retry, share another image, or claim delivery', async () => {
  const f = fixture({failure:new Error('simulated RPC timeout')});
  await f.share('send');
  assert.equal(f.calls.length, 1);
  assert.equal(f.toasts.length, 0);
  assert.equal(f.pngCaptures(), 0);
  assert.match(f.alerts[0][1], /Không thể xác nhận/);
});

test('Save is a separate local PNG path, never a Chat or Zalo send', async () => {
  const f = fixture();
  await f.share('save');
  assert.equal(f.calls.length, 0);
  assert.equal(f.pngCaptures(), 1);
  assert.equal(f.saves.length, 1);
  assert.equal(f.saves[0][1], 'congno.png');
});

test('server contract gates sender/recipient and deduplicates an actual Chat text message', () => {
  assert.match(bridge, /async function manualShareDebt\(customerId,requestId,captureImage\)/);
  assert.match(bridge, /taphoa_manual_debt_image_ticket/);
  assert.match(bridge, /taphoa_manual_debt_image_attach/);
  assert.match(bridge, /if\(!response\?\.ok\)return response/);
  assert.match(business, /manualShareDebt:\(id,requestId\)=>gateway\.rpc\('taphoa_manual_send_customer_debt'/);
  assert.match(sql, /v_ctx->>'taphoa_role'<>'admin'/);
  assert.match(sql, /a\.role='user' and a\.contact_group='customer'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /v_client_id:='manual:debt:'\|\|p_request_id::text/);
  assert.match(sql, /v_message_id:=public\.taphoa_chat_notify_customer/);
  assert.match(sql, /'message_id',v_message_id/);
  assert.doesNotMatch(sql, /insert into public\.v21_media_assets/i);
  assert.doesNotMatch(sql, /insert into public\.zalo_message_links/i);
  // Absence of a Zalo link is not a reason to suppress the *Chat* text notice.
  assert.doesNotMatch(sql, /from public\.zalo_user_links/i);
});
