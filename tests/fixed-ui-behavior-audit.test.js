import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';

const read=path=>readFile(path,'utf8');
const exists=async path=>{try{await access(path,constants.F_OK);return true;}catch{return false;}};

const MIGRATION='supabase/migrations/20260917010000_taphoa_display_codes.sql';

test('orders keep UUID internally but expose stable DT/DG display codes',async()=>{
  assert.equal(await exists(MIGRATION),true,'display-code migration is missing');
  const sql=await read(MIGRATION);
  assert.match(sql,/order_no\s+bigint/i);
  assert.match(sql,/order_no/i);
  assert.match(sql,/displayCode/i);
  assert.match(sql,/orderDisplayCode/i);

  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/function orderDisplayCode/);
  assert.match(bridge,/resolveOrderId/);
  assert.match(bridge,/orderIdByDisplayCode/);
  assert.match(bridge,/orderDisplayCodeById/);
});

test('customer UI uses username code and customer auth role maps to restricted user UI',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/first\(c,\['username'/);

  const override=await read('src/fixed-production-overrides.js');
  assert.match(override,/role==='customer'\?'user'/);

  const runtime=await read('src/fixed-ui-runtime-6.js');
  assert.match(runtime,/Mã: \$\{kh\[2\] \|\| kh\[0\]\}/);
});

test('cart renders most recently touched item first instead of alphabetically',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  assert.match(runtime,/cartTouchSeq/);
  assert.match(runtime,/touchCartItem/);
  assert.match(runtime,/b\._touch\s*-\s*a\._touch/);
  assert.doesNotMatch(runtime,/const cartEntries = Object\.entries\(cart\)\.sort\(\(\[, a\], \[, b\]\) =>\s*String\(a\.name/);
});

test('pending and delivered order cards are sorted newest first',async()=>{
  const pending=await read('src/fixed-ui-runtime-10.js');
  const delivered=await read('src/fixed-ui-runtime-11.js');
  assert.doesNotMatch(pending,/Object\.keys\(orders\)\.reverse\(\)/);
  assert.doesNotMatch(delivered,/Object\.keys\(orders\)\.reverse\(\)/);
  assert.match(pending,/sortOrderKeysNewestFirst/);
  assert.match(delivered,/sortOrderKeysNewestFirst/);
});

test('debt popup uses backend balanceAfter, hides reversals, stays newest first, and opens order detail',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/balanceAfter/);
  assert.match(bridge,/entryType/);
  assert.match(bridge,/orderDisplayCode/);

  const runtime=await read('src/fixed-ui-runtime-12.js');
  assert.match(runtime,/entryType !== 'reversal'/);
  assert.doesNotMatch(runtime,/history\.slice\(\)\.reverse\(\)/);
  assert.match(runtime,/showOrderDetailMobile\(orderCode, sheetName\)/);
  assert.doesNotMatch(runtime,/setTimeout\(\(\) => openCartMobile\(\), 320\)/);
});

test('desktop debt detail uses same left-work-area geometry as order detail',async()=>{
  const css=await read('src/fixed-ui-source-4.css');
  assert.match(css,/\.pc-mode #customerDebtModalWrapper/);
  assert.match(css,/right:480px !important/);
  assert.match(css,/\.pc-mode #customerDebtBottomSheet/);
});
