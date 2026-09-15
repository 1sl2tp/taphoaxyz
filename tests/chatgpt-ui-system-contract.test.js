import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {icon,ICON_NAMES} from '../src/core/icons.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('ChatGPT-aligned TAPHOA token layer is loaded after classic geometry',()=>{
  const html=read('index.html');
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/--tap-bg:\s*#fcfcfc/i);
  assert.match(css,/--tap-text:\s*#0d0d0d/i);
  assert.match(css,/--tap-text-secondary:\s*#5d5d5d/i);
  assert.match(css,/--tap-border:\s*rgba\(0,0,0,\.10\)/i);
  const classicIndex=html.indexOf('./src/styles/classic.css');
  const neutralIndex=html.indexOf('./src/styles/chatgpt-ui.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(classicIndex>=0&&neutralIndex>classicIndex&&scrollIndex>neutralIndex);
  assert.match(html,/<meta name="theme-color" content="#fcfcfc">/i);
});

test('shared icon registry owns required TAPHOA action glyphs',()=>{
  for(const name of ['search','close','plus','minus','cart','calendar','chevron-left','chevron-right','edit','trash','share','print','check','clock','user','logout','eye','eye-off','more']){
    assert.ok(ICON_NAMES.includes(name),`missing icon ${name}`);
  }
  const svg=icon('share',{size:20});
  assert.match(svg,/^<svg[^>]+viewBox=/);
  assert.match(svg,/width="20"/);
  assert.match(svg,/height="20"/);
  assert.match(svg,/currentColor/);
  assert.match(svg,/aria-hidden="true"/);
});

test('shared actions and overlays use neutral ChatGPT-aligned chrome',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/\.ui-button-primary[^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.ui-button-ghost[^}]*background:\s*transparent/s);
  assert.match(css,/\.ui-icon-button[^}]*min-(?:width|inline-size):\s*32px/s);
  assert.match(css,/\.ui-modal-surface[^}]*border-radius:\s*var\(--tap-radius-lg\)/s);
  assert.match(css,/\.ui-overlay-backdrop[^}]*rgba\(0,0,0,\.32\)/s);
  assert.doesNotMatch(css,/linear-gradient\(135deg,var\(--classic-blue\),var\(--classic-teal\)\)/);
});

test('UI decorator uses shared SVG icons instead of interface emoji',()=>{
  const uiSystem=read('src/core/ui-system.js');
  const index=read('index.html');
  assert.match(uiSystem,/from ['"]\.\/icons\.js['"]/);
  assert.match(uiSystem,/setButtonIcon/);
  assert.doesNotMatch(uiSystem,/document\.createTextNode\(['"]🛒/);
  assert.doesNotMatch(index,/>◉<|>×</);
});

test('shell and Sales use neutral final-theme chrome without changing geometry owners',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  const ui=read('src/core/ui-system.js');
  assert.match(css,/\.app-topbar[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.app-nav button\[aria-current="page"\][^}]*color:\s*var\(--tap-text\)/s);
  assert.match(css,/\.sales-customer-row[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.sales-group\[aria-pressed="true"\][^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.sales-qty button:last-child[^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.account-sheet-card[^}]*border:\s*1px solid var\(--tap-border\)/s);
  assert.match(css,/\.sales-search-row::before[^}]*content:\s*none/s);
  assert.match(ui,/ui-search-leading-icon/);
  assert.match(ui,/icon\('search'/);
});

test('Delivered and Pending share one neutral detail and overlay family',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  const ui=read('src/core/ui-system.js');
  assert.match(css,/\.delivered-detail-panel[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.pending-detail-panel[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.delivered-backdrop[^}]*background:\s*rgba\(0,0,0,\.32\)/s);
  assert.match(css,/\.pending-backdrop[^}]*background:\s*rgba\(0,0,0,\.32\)/s);
  assert.match(css,/\.pending-source-panel[^}]*border:\s*1px solid var\(--tap-border\)/s);
  assert.match(ui,/ui-modal-surface/);
  assert.match(ui,/data-delete-all/);
  assert.match(ui,/setButtonIcon\(button,'trash'/);
  assert.match(ui,/cleanStatusText/);
});
