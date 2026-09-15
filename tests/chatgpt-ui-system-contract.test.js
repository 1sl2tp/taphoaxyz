import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
