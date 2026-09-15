import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('classic reference layer keeps TAPHOA geometry while neutral theme owns final visuals',()=>{
  const html=read('index.html');
  const classic=read('src/styles/classic.css');
  const theme=read('src/styles/chatgpt-ui.css');
  assert.match(classic,/\.app-topbar[^{]*\{[^}]*min-height:\s*48px/s);
  assert.match(classic,/\.app-nav button[^{]*\{[^}]*height:\s*48px/s);
  const classicIndex=html.indexOf('./src/styles/classic.css');
  const themeIndex=html.indexOf('./src/styles/chatgpt-ui.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(classicIndex>=0&&themeIndex>classicIndex&&scrollIndex>themeIndex);
  assert.match(theme,/--tap-primary:\s*#0d0d0d/i);
  assert.doesNotMatch(theme,/--classic-(?:blue|teal)/);
});

test('classic geometry no longer owns the Sales search glyph',()=>{
  const classic=read('src/styles/classic.css');
  assert.doesNotMatch(classic,/\.sales-search-row::before\s*\{[^}]*content:\s*["']🔍["']/s);
});

test('classic shell still owns compact navigation and sheet geometry',()=>{
  const classic=read('src/styles/classic.css');
  assert.match(classic,/\.app-topbar[^{]*\{[^}]*min-height:\s*48px/s);
  assert.match(classic,/\.app-nav button[^{]*\{[^}]*height:\s*48px/s);
  assert.match(classic,/\.account-sheet-card[^{]*\{[^}]*border-radius:/s);
});
