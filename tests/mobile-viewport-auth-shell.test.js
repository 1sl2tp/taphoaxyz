import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone shell keeps viewport-fit and scroll ownership without disabling user zoom',()=>{
  const html=read('index.html');
  const base=read('src/styles/base.css');
  const owner=read('src/styles/scroll-owner.css');

  assert.match(html,/name="viewport"[^>]*width=device-width[^>]*initial-scale=1[^>]*viewport-fit=cover/i);
  assert.doesNotMatch(html,/maximum-scale=1|user-scalable=no/i);
  assert.match(base,/html,body\s*\{[^}]*width:100%[^}]*height:100%[^}]*overflow:hidden[^}]*overscroll-behavior:none/is);
  assert.match(owner,/\.taphoa-viewport\s*\{[^}]*position:fixed[^}]*inset:0[^}]*width:100%[^}]*height:100dvh[^}]*overflow:hidden/is);
  assert.match(owner,/\.login-screen\s*\{[^}]*height:100%[^}]*overflow:auto[^}]*overscroll-behavior:contain/is);
});

test('coarse pointer form controls stay at 16px to prevent iOS focus zoom',()=>{
  const base=read('src/styles/base.css');
  assert.match(base,/@media\s*\(pointer:coarse\)\s*\{[\s\S]*input,select,textarea\s*\{[^}]*font-size:16px/is);
});

test('login surface uses the shared UI token family rather than fallback or parallel colors',()=>{
  const css=read('src/styles/shell.css');
  assert.match(css,/\.login-screen\s*\{[^}]*background:var\(--ui-panel\)[^}]*color:var\(--ui-text\)/is);
  assert.match(css,/\.login-wrap\s*\{[^}]*max-width:448px/is);
  assert.match(css,/\.login-card\s*\{[^}]*background:var\(--ui-panel\)[^}]*border[^;]*var\(--ui-line\)/is);
  assert.match(css,/\.login-card>\.login-field[^\{]*\{[^}]*min-height:52px[^}]*border[^;]*var\(--ui-line\)[^}]*font-size:16px/is);
  assert.match(css,/\.login-submit\s*\{[^}]*min-height:52px[^}]*var\(--ui-primary\)/is);
  assert.match(css,/\.login-brand\s*\{[^}]*display:none!important/is);
  assert.match(css,/\.login-eye\s*\{[^}]*display:none!important/is);
});

test('account control stays outside the four business navigation tabs',()=>{
  const html=read('index.html');
  const css=read('src/styles/shell.css');
  assert.match(html,/class="app-topbar"[^>]*>[\s\S]*id="appNav"[\s\S]*id="accountButton"/i);
  assert.match(html,/id="accountButton"[^>]*aria-label="Tài khoản"/i);
  assert.match(css,/\.app-topbar\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 44px/is);
});

test('account sheet exposes identity and logout using shared sheet tokens',()=>{
  const html=read('index.html');
  const css=read('src/styles/shell.css');
  const app=read('src/app.js');

  assert.match(html,/id="accountSheet"[^>]*class="account-sheet"[^>]*hidden/i);
  assert.match(html,/id="accountSheetBackdrop"/i);
  assert.match(html,/id="accountName"/i);
  assert.match(html,/id="accountHandle"/i);
  assert.match(html,/id="accountLogout"[^>]*>\s*Đăng xuất\s*</i);
  assert.match(css,/\.account-sheet\s*\{[^}]*position:fixed[^}]*inset:0/is);
  assert.match(css,/\.account-sheet-card\s*\{[^}]*background:var\(--ui-panel\)[^}]*border-radius:var\(--ui-sheet-radius\) var\(--ui-sheet-radius\) 0 0[^}]*padding-bottom:calc\([^)]*safe-bottom/is);
  assert.match(app,/function\s+renderAccountIdentity\s*\(/);
  assert.match(app,/function\s+openAccountSheet\s*\(/);
  assert.match(app,/function\s+closeAccountSheet\s*\(/);
  assert.match(app,/await\s+auth\.logout\(\)[\s\S]*openLogin\(\)/);
});
