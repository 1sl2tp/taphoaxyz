import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../no/index.html',import.meta.url),'utf8').toLowerCase();
test('no legacy link enters the unified customer mini app',()=>{
  assert.ok(html.includes("p.set('tab','no')"));
  assert.ok(html.includes("location.replace('/kh/?'"));
});
