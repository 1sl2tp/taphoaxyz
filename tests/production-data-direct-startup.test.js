import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const startup=fs.readFileSync(new URL('../src/fixed-startup-nonblocking.js',import.meta.url),'utf8');

test('production startup imports the bridge itself and retries instead of depending on one event',()=>{
  assert.match(startup,/import\(['"]\.\/fixed-production-bridge\.js['"]\)/,'startup must load the production bridge directly');
  assert.match(startup,/DOMContentLoaded/,'startup must wait for the DOM');
  assert.match(startup,/TAPHOA_FIXED_PRODUCTION_BOOT/,'startup must invoke the captured production bootstrap');
  assert.match(startup,/setTimeout\(tryStart/,'startup must retry when the bridge is not ready');
});
