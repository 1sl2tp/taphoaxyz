import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';

const read=path=>readFile(path,'utf8');
const exists=async path=>{try{await access(path,constants.F_OK);return true;}catch{return false;}};

const OLD_UI_PATHS=[
  'src/app.js',
  'src/screens/sales.js','src/screens/delivered.js','src/screens/pending.js','src/screens/debt.js','src/screens/settings.js',
  'src/styles/base.css','src/styles/shell.css','src/styles/chatgpt-ui.css','src/styles/classic.css','src/styles/fixed-ui.css',
  'src/styles/sales.css','src/styles/delivered.css','src/styles/pending.css','src/styles/debt.css','src/styles/iphone-visual-cleanup.css',
  'src/styles/scroll-owner.css','src/styles/taphoa-sales-redesign.css','src/styles/taphoa-tailwind.css','src/styles/taphoa-tailwind.entry.css',
  'src/styles/taphoa-tailwind.input.css','src/styles/taphoa-th2-auth.css','src/styles/taphoa-th2-final.css','src/styles/taphoa-th3.css',
  'src/styles/taphoa-th4-geometry.css','src/styles/ui-system.css',
  'src/styles/tailwind/debt.css','src/styles/tailwind/foundation.css','src/styles/tailwind/orders.css','src/styles/tailwind/popups.css',
  'src/styles/tailwind/responsive.css','src/styles/tailwind/sales.css','src/styles/tailwind/shell.css','src/styles/tailwind/tokens.css',
  'src/core/app-update-bootstrap.js','src/core/app-update.js','src/core/icons.js','src/core/ime-stability.js','src/core/print.js',
  'src/core/router.js','src/core/scroll-owner.js','src/core/semantic-ui.js','src/core/share-receipt.js','src/core/system.js','src/core/ui-system.js'
];

const markupPaths=Array.from({length:5},(_,i)=>`src/fixed-ui-markup-${i+1}.js`);
const runtimePaths=Array.from({length:13},(_,i)=>`src/fixed-ui-runtime-${i+1}.js`);
const cssPaths=Array.from({length:4},(_,i)=>`src/fixed-ui-source-${i+1}.css`);

test('production index loads only the complete FIXED frontend runtime',async()=>{
  const html=await read('index.html');
  assert.match(html,/TAPHOA_GEMINI_100_SAMPLE_FIXED/);
  for(const path of [...cssPaths,...markupPaths,...runtimePaths,'src/fixed-production-bridge.js','src/fixed-production-overrides.js','src/fixed-ui-behavior.js'])
    assert.ok(html.includes(`./${path}`),`index missing FIXED source: ${path}`);
  for(const oldMarker of ['id="screenHost"','id="appNav"','./src/app.js','./src/styles/'])
    assert.ok(!html.includes(oldMarker),`legacy UI still loaded: ${oldMarker}`);
});

test('FIXED markup contains login and all five menus',async()=>{
  const markup=(await Promise.all(markupPaths.map(read))).join('\n');
  for(const marker of ['id=\\"loginScreen\\"','id=\\"appContainer\\"','id=\\"topNav\\"','id=\\"tab-ban-hang\\"','id=\\"tab-da-giao\\"','id=\\"tab-don-tam\\"','id=\\"tab-cong-no\\"','id=\\"tab-cai-dat\\"'])
    assert.ok(markup.includes(marker),`FIXED markup missing: ${marker}`);
});

test('FIXED runtime carries the complete UI behavior and production override',async()=>{
  const runtime=(await Promise.all(runtimePaths.map(read))).join('\n');
  for(const marker of ['function switchTab','function showLoginScreen','function renderProductList','function renderCartUI','function renderCongNo'])
    assert.ok(runtime.includes(marker),`FIXED runtime missing: ${marker}`);
  const override=await read('src/fixed-production-overrides.js');
  assert.match(override,/taphoa:\/\/production/);
  assert.match(override,/submitPreviewLogin/);
  assert.match(override,/dayToanBoGioHang/);
});

test('legacy taphoaxyz UI renderer, styles and helpers are deleted',async()=>{
  const remaining=[];
  for(const path of OLD_UI_PATHS)if(await exists(path))remaining.push(path);
  assert.deepEqual(remaining,[],`legacy UI files remain:\n${remaining.join('\n')}`);
});

test('production bridge keeps existing auth and business layer only',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  for(const marker of ['createAuthService','createApi','saveOrder','deliverOrder','reverseOrder','deletePending','batchOrders','debtTransaction'])
    assert.ok(bridge.includes(marker),`bridge missing: ${marker}`);
  assert.ok(!bridge.includes('PREVIEW_SAMPLE_DATA'),'preview sample data must not be a production data source');
});
