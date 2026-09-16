import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';

const read=path=>readFile(path,'utf8');
const exists=async path=>{try{await access(path,constants.F_OK);return true;}catch{return false;}};

const OLD_UI_PATHS=[
  'src/app.js',
  'src/screens/sales.js',
  'src/screens/delivered.js',
  'src/screens/pending.js',
  'src/screens/debt.js',
  'src/screens/settings.js',
  'src/styles/base.css',
  'src/styles/shell.css',
  'src/styles/chatgpt-ui.css',
  'src/styles/classic.css',
  'src/styles/sales.css',
  'src/styles/delivered.css',
  'src/styles/pending.css',
  'src/styles/debt.css',
  'src/styles/iphone-visual-cleanup.css',
  'src/styles/scroll-owner.css',
  'src/styles/taphoa-sales-redesign.css',
  'src/styles/taphoa-tailwind.css',
  'src/styles/taphoa-tailwind.entry.css'
];

test('production index is the complete TAPHOA_GEMINI_100_SAMPLE_FIXED shell',async()=>{
  const html=await read('index.html');
  for(const marker of [
    'TAPHOA_GEMINI_100_SAMPLE_FIXED',
    'id="loginScreen"',
    'id="appContainer"',
    'id="topNav"',
    'id="tab-ban-hang"',
    'id="tab-da-giao"',
    'id="tab-don-tam"',
    'id="tab-cong-no"',
    'id="tab-cai-dat"',
    './src/fixed-production-bridge.js'
  ]) assert.ok(html.includes(marker),`missing FIXED marker: ${marker}`);

  for(const oldMarker of ['id="screenHost"','id="appNav"','./src/app.js','./src/styles/base.css','./src/styles/shell.css','./src/styles/taphoa-tailwind.css'])
    assert.ok(!html.includes(oldMarker),`legacy UI still loaded: ${oldMarker}`);
});

test('legacy taphoaxyz UI renderer and style files are deleted',async()=>{
  const remaining=[];
  for(const path of OLD_UI_PATHS)if(await exists(path))remaining.push(path);
  assert.deepEqual(remaining,[],`legacy UI files remain:\n${remaining.join('\n')}`);
});

test('production bridge uses existing business/auth layer instead of preview sample transport',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  for(const marker of ['createAuthService','createApi','taphoa://production','saveOrder','deliverOrder','reverseOrder','deletePending','batchOrders','debtTransaction'])
    assert.ok(bridge.includes(marker),`bridge missing: ${marker}`);
  assert.ok(!bridge.includes('PREVIEW_SAMPLE_DATA'),'preview sample data must not be a production data source');
});
