import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('login fields are real inputs, not input-styled wrappers around inputs',async()=>{
  const html=await read('index.html');
  assert.match(html,/<input class="login-field" id="loginUsername"/);
  assert.match(html,/<div class="login-password"><input class="login-field" id="loginPassword"/);
  assert.doesNotMatch(html,/<div class="login-field"><input/);
});

test('close icon hydration targets only visible icon buttons, never popup backdrops',async()=>{
  const ui=await read('src/core/ui-system.js');
  assert.match(ui,/\.ui-icon-button\[data-cart-close\]/);
  assert.match(ui,/\.ui-icon-button\[data-detail-close\]/);
  assert.match(ui,/\.ui-icon-button\[data-order-close\]/);
  assert.match(ui,/\.ui-icon-button\[data-print-close\]/);
  assert.match(ui,/\.ui-icon-button\[data-source-close\]/);
  assert.match(ui,/\.ui-icon-button\[data-debt-close\]/);
  assert.doesNotMatch(ui,/hydrateButton\(root,'\[data-search-clear\],\[data-delivered-clear\],\[data-cart-close\]/);
});
