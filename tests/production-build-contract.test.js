import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../scripts/build-current.mjs',import.meta.url),'utf8');
const direct=fs.readFileSync(new URL('../src/fixed-production-direct-startup.js',import.meta.url),'utf8');

test('production build emits the FIXED frontend without the retired UI build pipeline',()=>{
  assert.equal(pkg.scripts['build:production'],'node scripts/build-current.mjs');
  assert.equal(pkg.scripts.build,'node scripts/build-current.mjs');
  assert.equal(pkg.scripts['ui:build'],undefined);
  assert.match(index,/TAPHOA_GEMINI_100_SAMPLE_FIXED/);
  assert.match(index,/src\/fixed-production-direct-startup\.js/);
  assert.match(direct,/import\(['"]\.\/fixed-production-bridge\.js['"]\)/);
  assert.ok(fs.existsSync(new URL('../src/fixed-production-bridge.js',import.meta.url)));
  assert.match(index,/src\/fixed-ui-runtime-13\.js/);
  assert.doesNotMatch(index,/src\/app\.js|src\/styles\//);
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

test('production build identity is derived from emitted content without provider-specific commit markers',()=>{
  assert.match(build,/createHash\(['"]sha256['"]\)/);
  assert.match(build,/content-/);
  assert.match(build,/main-content/);
  assert.doesNotMatch(build,/VERCEL_GIT_COMMIT_SHA|GITHUB_SHA/);
  assert.match(build,/Stamped app-build-id mismatch/);
  assert.match(build,/Stamped version build_id mismatch/);
});
