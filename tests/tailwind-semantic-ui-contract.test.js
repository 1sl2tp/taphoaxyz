import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('TAPHOA uses real Tailwind v4 as the final visual owner',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  assert.match(pkg.devDependencies?.tailwindcss||'',/^\^?4\./);
  assert.match(pkg.devDependencies?.['@tailwindcss/cli']||'',/^\^?4\./);
  assert.match(pkg.scripts?.['ui:build']||'',/@tailwindcss\/cli/);
  const index=await read('index.html');
  assert.match(index,/\.\/src\/styles\/taphoa-tailwind\.css/);
  assert.match(index,/\.\/src\/core\/semantic-ui\.js/);
  assert.doesNotMatch(index,/chatgpt-ui\.css|iphone-visual-cleanup\.css|classic\.css/);
});

test('semantic UI roles preserve main to popup flow instead of converting screens to split view',async()=>{
  const ui=await read('src/core/semantic-ui.js');
  for(const role of ['ui-main','ui-toolbar','ui-table','ui-row','ui-action','ui-popup-l1','ui-popup-l2'])assert.match(ui,new RegExp(role));
  for(const screen of ['sales','delivered','pending','debt'])assert.match(ui,new RegExp(`data-screen-id=.${screen}.`));
  assert.match(ui,/uiLayer/);
  assert.match(ui,/popup-level-1/);
  assert.match(ui,/popup-level-2/);
});

test('Tailwind source defines touch-first type and surface hierarchy',async()=>{
  const css=await read('src/styles/taphoa-tailwind.input.css');
  assert.match(css,/@import\s+["']tailwindcss["']/);
  assert.match(css,/--tap-touch:\s*44px/);
  assert.match(css,/--tap-text-body:\s*15px/);
  assert.match(css,/--tap-text-action:\s*15px/);
  assert.match(css,/\.ui-popup-l1/);
  assert.match(css,/\.ui-popup-l2/);
  assert.match(css,/\.ui-table/);
  assert.match(css,/\.ui-row/);
  assert.match(css,/\.ui-action/);
});
