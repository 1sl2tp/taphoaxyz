import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const build=fs.readFileSync(new URL('../scripts/build-current.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/main-pages-publish.yml',import.meta.url),'utf8');

test('customer mini app is shipped by the production Pages build',()=>{
  assert.ok(build.includes("await cp('kh','dist/kh',{recursive:true});"));
  assert.ok(workflow.includes("- 'kh/**'"));
});
