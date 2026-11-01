import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-IOS-PWA-SHELL-TOP-20261101
// Given an iPhone home-screen PWA with a dynamic viewport different
// from the layout viewport, when the sales shell first appears,
// it stays aligned to the top of the available browser content area,
// without a vertical centering gutter or a second safe-area offset.
// Desktop, forced desktop, and the existing cart/touch owner stay intact.
const css=readFileSync(new URL('../src/fixed-ui-source-1.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sales=readFileSync(new URL('../src/fixed-ui-markup-1.js',import.meta.url),'utf8');
const media=readFileSync(new URL('../src/fixed-ui-product-media.css',import.meta.url),'utf8');

test('mobile shell aligns to top of iOS dynamic viewport rather than centering vertically',()=>{
  assert.match(shell,/class="bg-gray-300 flex justify-center h-screen items-center/);
  assert.match(css,/#appContainer\s*\{[^}]*height: 100vh; height: 100dvh/);
  const start=css.indexOf('/* SPEC-IOS-PWA-SHELL-TOP-20261101:');
  const end=css.indexOf('@media (min-width: 768px)',start);
  assert.ok(start>=0&&end>start,'top inset fix applies before desktop rules');
  const owner=css.slice(start,end);
  assert.match(owner,/@media \(max-width:767px\)\s*\{/);
  assert.match(owner,/body:not\(\[data-force-pc="1"\]\)\s*\{/);
  assert.match(owner,/height:100dvh !important/);
  assert.match(owner,/align-items:flex-start !important/);
  assert.match(owner,/background-color:var\(--app-surface,#fff\) !important/);
  assert.doesNotMatch(owner,/padding-top\s*:|safe-area-inset-top|position\s*:\s*fixed/i);
});

test('iOS status bar is native; desktop preview and sales/cart controls stay unchanged',()=>{
  assert.match(shell,/viewport-fit=cover/);
  assert.match(shell,/apple-mobile-web-app-status-bar-style" content="default"/);
  assert.match(css,/@media \(min-width: 768px\)/);
  assert.match(css,/\.pc-mode #appContainer\s*\{/);
  assert.match(css,/body\[data-force-pc="1"\] #appContainer/);
  assert.match(sales,/id=\\"topNav\\"/);
  assert.match(sales,/h-\[64px\]/);
  assert.match(sales,/id=\\"productList\\"/);
  assert.match(sales,/id=\\"saleCustomerTrigger\\"/);
  assert.match(media,/#tab-ban-hang \.product-card button\[onclick\^="updateCart\("\]\s*\{[\s\S]{0,110}width:40px !important/);
});
