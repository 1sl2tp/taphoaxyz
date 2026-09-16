import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const build=readFileSync(new URL('../scripts/build-current.mjs',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('production build keeps critical bridge URLs stable for service-worker fallback',()=>{
  assert.doesNotMatch(build,/fixed-production-bridge\.js[^\n]*\?v=/);
  assert.doesNotMatch(build,/fixed-production-overrides\.js[^\n]*\?v=/);
});

test('service worker falls back to a canonical cached asset on HTTP errors as well as network errors',()=>{
  assert.match(sw,/canonicalRequest/);
  assert.match(sw,/if\s*\(response\?\.ok\)/);
  assert.match(sw,/cachedFallback/);
  assert.match(sw,/return cached\s*\|\|\s*response/);
});
