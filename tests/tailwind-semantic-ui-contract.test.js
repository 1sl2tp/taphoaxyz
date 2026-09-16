import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('TAPHOA uses real Tailwind v4 as the final visual owner',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  assert.match(pkg.devDependencies?.tailwindcss||'',/^\^?4\./);
  assert.match(pkg.devDependencies?.['@tailwindcss/cli']||'',/^\^?4\./);
  assert.match(pkg.scripts?.['ui:build']||'',/@tailwindcss\/cli/);
  assert.match(pkg.scripts?.['ui:build']||'',/taphoa-tailwind\.entry\.css/);
  const entry=await read('src/styles/taphoa-tailwind.entry.css');
  assert.match(entry,/taphoa-tailwind\.input\.css/);
  assert.match(entry,/taphoa-th3\.css/);
  const index=await read('index.html');
  assert.match(index,/\.\/src\/styles\/taphoa-tailwind\.css/);
  assert.doesNotMatch(index,/\.\/src\/core\/semantic-ui\.js/);
  assert.doesNotMatch(index,/chatgpt-ui\.css|iphone-visual-cleanup\.css|classic\.css/);
});

test('semantic UI roles live in business markup and preserve main to popup flow',async()=>{
  const sources=await Promise.all(['sales','delivered','pending','debt'].map(name=>read(`src/screens/${name}.js`)));
  const combined=sources.join('\n');
  for(const role of ['ui-main','ui-table','ui-row','ui-action','ui-popup-l1','ui-popup-l2'])assert.match(combined,new RegExp(role));
  for(const screen of ['sales','delivered','pending','debt'])assert.match(combined,new RegExp(`data-screen-id=\\"${screen}\\"`));
  const runtime=await read('src/core/ui-system.js');
  assert.doesNotMatch(runtime,/decoratePendingCards|DETAIL_UI_CONFIG|replaceText\(/);
});

test('Tailwind source defines touch-first type and surface hierarchy',async()=>{
  const css=await read('src/styles/taphoa-tailwind.input.css');
  const th3=await read('src/styles/taphoa-th3.css');
  assert.match(css,/@import\s+["']tailwindcss["']/);
  assert.match(css,/--tap-touch:\s*44px/);
  assert.match(css,/--tap-text-body:\s*15px/);
  assert.match(css,/--tap-text-action:\s*15px/);
  assert.match(css,/\.ui-popup-l1/);
  assert.match(css,/\.ui-popup-l2/);
  assert.match(css,/\.ui-table/);
  assert.match(css,/\.ui-row/);
  assert.match(css,/\.ui-action/);
  assert.match(th3,/\.ui-action-debt/);
  assert.match(th3,/scrollbar-gutter:stable/);
});
