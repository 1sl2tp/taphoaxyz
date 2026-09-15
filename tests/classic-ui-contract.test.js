import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('classic visual stylesheet owns the TAPHOA reference palette and loads before scroll ownership',()=>{
  const html=read('index.html');
  const classic=read('src/styles/classic.css');
  assert.match(classic,/--classic-bg:\s*#F0F4F8/i);
  assert.match(classic,/--classic-blue:\s*#1565C0/i);
  assert.match(classic,/--classic-teal:\s*#00838F/i);
  assert.match(classic,/linear-gradient\(135deg,var\(--classic-blue\),var\(--classic-teal\)\)/);
  const classicIndex=html.indexOf('./src/styles/classic.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(classicIndex>=0&&scrollIndex>classicIndex);
});

test('classic shell keeps compact seller navigation and profile sheet surfaces',()=>{
  const classic=read('src/styles/classic.css');
  assert.match(classic,/\.app-topbar[^{]*\{[^}]*min-height:\s*48px/s);
  assert.match(classic,/\.app-nav button[^{]*\{[^}]*height:\s*48px/s);
  assert.match(classic,/\.account-sheet-card[^{]*\{[^}]*border-radius:/s);
});
