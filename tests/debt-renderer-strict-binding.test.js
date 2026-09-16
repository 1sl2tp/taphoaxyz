import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

test('production debt renderer has a customersArray binding before strict override executes',()=>{
  assert.match(overrides,/customersArray\s*=\s*Object\.keys\(customerDebts\)/,'debt renderer still assigns customersArray');
  const overridePos=index.indexOf('fixed-production-overrides.js');
  assert.ok(overridePos>0,'production override must be loaded');
  const beforeOverride=index.slice(0,overridePos);
  assert.match(beforeOverride,/\bvar\s+customersArray\s*=\s*\[\s*\]/,'customersArray must exist before the strict production override runs');
});
