import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../scripts/build-current.mjs',import.meta.url),'utf8');

test('Vercel deploys the current modular TAPHOA app, not the legacy V1.33 artifact',()=>{
  assert.equal(vercel.buildCommand,'npm run build:production');
  assert.equal(vercel.outputDirectory,'dist');
  assert.equal(pkg.scripts['build:production'],'node scripts/build-current.mjs');
  assert.match(index,/src\/app\.js/);
  assert.match(build,/cp\([^)]*index\.html/);
  assert.match(build,/cp\([^)]*manifest\.webmanifest/);
  assert.match(build,/cp\([^)]*src/);
  assert.doesNotMatch(build,/build-v128|harden-v1(?:29|30|31|32|33)/i);
});

test('production artifact keeps the shared-account cutover source tree intact',()=>{
  assert.match(build,/dist/);
  assert.match(build,/recursive\s*:\s*true/);
  assert.match(build,/rm\([^)]*dist/);
});
