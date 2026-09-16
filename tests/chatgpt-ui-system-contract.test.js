import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {icon,ICON_NAMES} from '../src/core/icons.js';
import {cleanStatusText} from '../src/core/ui-system.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Tailwind semantic layer is the only business visual owner before scroll ownership',()=>{
  const html=read('index.html');
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(css,/--tap-page:#f4f4f5/i);
  assert.match(css,/--tap-text:#18181b/i);
  assert.match(css,/--tap-touch:\s*44px/i);
  const tailwindIndex=html.indexOf('./src/styles/taphoa-tailwind.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(tailwindIndex>=0&&scrollIndex>tailwindIndex);
  assert.doesNotMatch(html,/src\/styles\/(?:sales|delivered|pending|debt)\.css/);
  assert.doesNotMatch(html,/classic\.css|chatgpt-ui\.css|iphone-visual-cleanup\.css/);
  assert.match(html,/<meta name="theme-color" content="#f4f4f5">/i);
});

test('shared icon registry owns required TAPHOA action glyphs',()=>{
  for(const name of ['search','close','plus','minus','cart','calendar','chevron-left','chevron-right','edit','trash','share','print','check','clock','user','logout','eye','eye-off','more'])assert.ok(ICON_NAMES.includes(name),`missing icon ${name}`);
  const svg=icon('share',{size:20});
  assert.match(svg,/^<svg[^>]+viewBox=/);
  assert.match(svg,/width="20"/);
  assert.match(svg,/height="20"/);
  assert.match(svg,/currentColor/);
  assert.match(svg,/aria-hidden="true"/);
});

test('status cleanup is idempotent so MutationObserver does not self-trigger forever',()=>{
  let value='Đã giao',writes=0;
  const node={get textContent(){return value;},set textContent(next){writes+=1;value=next;}};
  cleanStatusText(node);
  assert.equal(value,'Đã giao');
  assert.equal(writes,0);
  value='✅ Đã giao';
  cleanStatusText(node);
  assert.equal(value,'Đã giao');
  assert.equal(writes,1);
  cleanStatusText(node);
  assert.equal(writes,1);
});

test('shared actions and overlays use touch-first semantic chrome',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(css,/\.ui-action\s*\{/);
  assert.match(css,/\.ui-action-primary\s*\{/);
  assert.match(css,/\.ui-icon-button\s*\{[^}]*width:var\(--tap-touch\)/s);
  assert.match(css,/\.ui-popup-l1,\.ui-popup-l2\s*\{/);
  assert.match(css,/--tap-shadow-popup:/);
  assert.doesNotMatch(css,/linear-gradient\(135deg/);
});

test('UI decorator uses shared SVG icons instead of interface emoji',()=>{
  const uiSystem=read('src/core/ui-system.js');
  const index=read('index.html');
  assert.match(uiSystem,/from ['"]\.\/icons\.js['"]/);
  assert.match(uiSystem,/setButtonIcon/);
  assert.doesNotMatch(uiSystem,/document\.createTextNode\(['"]🛒/);
  assert.doesNotMatch(index,/>◉<|>×</);
});

test('shell and Sales use the Tailwind final visual owner while keeping Sales behavior',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  const ui=read('src/core/ui-system.js');
  assert.match(css,/\.app-nav-label\s*\{[^}]*font-size:12px/s);
  assert.match(css,/\.account-button\s*\{[^}]*width:44px[^}]*height:44px/s);
  assert.match(css,/\.sales-product-row\s*\{[^}]*min-height:68px/s);
  assert.match(css,/\.sales-qty button[^}]*width:44px/s);
  assert.match(css,/\.sales-cart-desktop\s*\{\s*display:none!important/s);
  assert.match(ui,/ui-search-leading-icon/);
  assert.match(ui,/icon\('search'/);
});

test('Delivered and Pending preserve popup flow with semantic popup levels',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  const semantic=read('src/core/semantic-ui.js');
  assert.match(css,/\.delivered-detail-panel\.ui-popup-l1/);
  assert.match(css,/\.pending-detail-panel\.ui-popup-l1/);
  assert.match(css,/\.pending-source-panel\.ui-popup-l1/);
  assert.match(css,/\.delivered-print-panel\.ui-popup-l2/);
  assert.match(css,/\.pending-print-panel\.ui-popup-l2/);
  assert.match(semantic,/popup-level-1/);
  assert.match(semantic,/popup-level-2/);
});

test('Debt uses neutral rows and semantic colors only for money actions and balances',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  const semantic=read('src/core/semantic-ui.js');
  assert.match(css,/\.debt-customer-row\s*\{[^}]*border-radius:0!important/s);
  assert.match(css,/\.debt-quick-actions button:nth-of-type\(1\)/);
  assert.match(css,/\.debt-quick-actions button:nth-of-type\(2\)/);
  assert.match(css,/\.debt-order-panel\.ui-popup-l2/);
  assert.match(semantic,/data-debt-share/);
  assert.match(semantic,/data-detail-action/);
});
