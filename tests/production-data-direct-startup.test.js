import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const directUrl=new URL('../src/fixed-production-direct-startup.js',import.meta.url);

test('production data has one direct startup path',()=>{
  assert.doesNotMatch(index,/fixed-production-start-owner\.js/);
  assert.doesNotMatch(index,/fixed-startup-nonblocking\.js/);
  assert.doesNotMatch(index,/type="module" src="\.\/src\/fixed-production-bridge\.js"/);
  assert.match(index,/fixed-production-overrides\.js[\s\S]*fixed-production-direct-startup\.js/);
  assert.ok(fs.existsSync(directUrl),'direct production startup file must exist');
  const direct=fs.readFileSync(directUrl,'utf8');
  assert.match(direct,/const\s+boot\s*=\s*window\.onload/);
  assert.match(direct,/window\.onload\s*=\s*null/);
  assert.match(direct,/import\(['"]\.\/fixed-production-bridge\.js['"]\)/);
  assert.match(direct,/DOMContentLoaded/);
  assert.match(direct,/await\s+boot\(\)/);
  assert.match(direct,/setTimeout/);
});
