import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTailwindSourceSync} from './helpers/tailwind-source.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Tailwind replaces the retired classic and ChatGPT visual owner stack',()=>{
  const html=read('index.html');
  const css=readTailwindSourceSync();
  assert.doesNotMatch(html,/\.\/src\/styles\/classic\.css/);
  assert.doesNotMatch(html,/\.\/src\/styles\/chatgpt-ui\.css/);
  assert.doesNotMatch(html,/\.\/src\/styles\/iphone-visual-cleanup\.css/);
  const tailwindIndex=html.indexOf('./src/styles/taphoa-tailwind.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(tailwindIndex>=0&&scrollIndex>tailwindIndex);
  assert.match(css,/--tap-primary:#18181b/);
});

test('retired classic source no longer owns the Sales search glyph',()=>{
  const classic=read('src/styles/classic.css');
  assert.doesNotMatch(classic,/\.sales-search-row::before\s*\{[^}]*content:\s*["']🔍["']/s);
});

test('new shell contract uses readable labels and touch-size account control',()=>{
  const css=readTailwindSourceSync();
  assert.match(css,/\.app-nav-label\s*\{[^}]*font-size:12px/s);
  assert.match(css,/\.account-button\s*\{[^}]*width:44px[^}]*height:44px/s);
  assert.match(css,/\.app-nav button\s*\{[^}]*min-height:60px/s);
});
