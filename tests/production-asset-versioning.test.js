import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const build=readFileSync(new URL('../scripts/build-current.mjs',import.meta.url),'utf8');

test('production build cache-busts the live bridge and override scripts with build_id',()=>{
  assert.match(build,/fixed-production-bridge\.js/);
  assert.match(build,/fixed-production-overrides\.js/);
  assert.match(build,/\?v=\$\{buildId\}/);
});
