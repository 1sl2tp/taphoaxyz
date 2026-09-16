import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

test('production data has one direct startup path',()=>{
  assert.doesNotMatch(index,/fixed-production-start-owner\.js/);
  assert.doesNotMatch(index,/fixed-startup-nonblocking\.js/);
  assert.doesNotMatch(index,/type="module" src="\.\/src\/fixed-production-bridge\.js"/);
  assert.match(overrides,/import\(['"]\.\/fixed-production-bridge\.js['"]\)/);
  assert.match(overrides,/DOMContentLoaded/);
  assert.match(overrides,/await\s+refreshFixedSheets\(\)/);
});
