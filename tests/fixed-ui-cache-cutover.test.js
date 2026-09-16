import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('FIXED frontend actively cuts over stale pre-replacement service-worker cache',()=>{
  const index=read('index.html');
  const sw=read('sw.js');
  const bootstrap=read('src/fixed-cutover-bootstrap.js');

  assert.match(index,/\.\/src\/fixed-cutover-bootstrap\.js/);
  assert.doesNotMatch(sw,/CACHE_NAME\s*=\s*['"]taphoa-runtime-v1['"]/);
  assert.match(sw,/CACHE_NAME\s*=\s*['"]taphoa-runtime-fixed-v2['"]/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\).*key!==CACHE_NAME/);
  assert.match(bootstrap,/serviceWorker\.register\(['"]\.\/sw\.js['"],[\s\S]*updateViaCache\s*:\s*['"]none['"]/);
  assert.match(bootstrap,/controllerchange/);
  assert.match(bootstrap,/SKIP_WAITING/);
  assert.match(bootstrap,/location\.reload\(\)/);
});
