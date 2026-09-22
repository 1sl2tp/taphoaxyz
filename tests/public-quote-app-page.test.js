import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../b/index.html',import.meta.url),'utf8').toLowerCase();
test('b legacy link enters the unified customer mini app',()=>{
  assert.ok(html.includes("p.set('tab','hang')"));
  assert.ok(html.includes("location.replace('/kh/?'"));
});
