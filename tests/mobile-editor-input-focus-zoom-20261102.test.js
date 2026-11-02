import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-TAPHOA-MOBILE-FOCUS-SCALE-20261102
// Given mobile PWA / iOS web compact product editing,
// when focusing text or money inputs, focus must use >=16px to avoid
// WebKit page magnification, without changing the idle density, amount
// representation, edit/save handlers or business/DB data.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/fixed-ui-source-4.css');
const html=read('index.html');
test('product editing raises only focused mobile input font to iOS-safe size',()=>{
  const scope=css.slice(css.indexOf('/* SPEC-TAPHOA-MOBILE-FOCUS-SCALE-20261102'));
  assert.ok(css.includes('body[data-resolved-mode="mobile"] .product-editor-input,'));
  const idle=css.slice(css.indexOf('body[data-resolved-mode="mobile"] .product-editor-input,'),css.indexOf('/* SPEC-TAPHOA-MOBILE-FOCUS-SCALE-20261102'));
  assert.ok(idle.includes('height:28px !important;'));
  assert.ok(idle.includes('font-size:12px !important;'));
  assert.ok(scope.includes('body[data-resolved-mode="mobile"] input.product-editor-input:focus{'));
  assert.ok(scope.includes('font-size:16px !important;'));
  const focusRule=scope.slice(scope.indexOf('input.product-editor-input:focus{')).split('}')[0];
  assert.ok(!focusRule.includes('transform:')&&!focusRule.includes('zoom:')&&!focusRule.includes('touch-action:'),
    'focused input is not allowed to rescale the app or change gestures');
  assert.ok(html.includes('focus-zoom=20261102'), 'new PWA asset query must reach installed clients');
});
