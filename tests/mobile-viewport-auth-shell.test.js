import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone shell locks document zoom and outer scroll while keeping inner owners',()=>{
  const html=read('index.html');
  const base=read('src/styles/base.css');
  const owner=read('src/styles/scroll-owner.css');

  assert.match(html,/name="viewport"[^>]*maximum-scale=1[^>]*user-scalable=no/i);
  assert.match(base,/html,body\s*\{[^}]*width:100%[^}]*height:100%[^}]*overflow:hidden[^}]*overscroll-behavior:none/is);
  assert.match(owner,/\.taphoa-viewport\s*\{[^}]*position:fixed[^}]*inset:0[^}]*width:100%[^}]*height:100dvh[^}]*overflow:hidden/is);
  assert.match(owner,/\.login-screen\s*\{[^}]*height:100%[^}]*overflow:auto[^}]*overscroll-behavior:contain/is);
});

test('coarse pointer form controls stay at 16px to prevent iOS focus zoom',()=>{
  const base=read('src/styles/base.css');
  assert.match(base,/@media\s*\(pointer:coarse\)\s*\{[\s\S]*input,select,textarea\s*\{[^}]*font-size:16px/is);
});

test('login surface has a complete mobile auth skin rather than fallback form styling',()=>{
  const css=read('src/styles/shell.css');
  assert.match(css,/\.login-screen\s*\{[^}]*background:#fff/is);
  assert.match(css,/\.login-wrap\s*\{[^}]*max-width:448px/is);
  assert.match(css,/\.login-card\s*\{[^}]*border-radius:28px[^}]*border:1px solid/is);
  assert.match(css,/\.login-field input\s*\{[^}]*min-height:56px[^}]*border-radius:22px[^}]*font-size:16px/is);
  assert.match(css,/\.login-submit\s*\{[^}]*min-height:56px[^}]*border-radius:999px/is);
});
