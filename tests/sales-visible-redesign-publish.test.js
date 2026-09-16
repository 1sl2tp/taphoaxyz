import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Sales redesign is a dedicated Tailwind module with a visible layout version',async()=>{
  const entry=await read('src/styles/taphoa-tailwind.entry.css');
  assert.match(entry,/@import\s+"\.\/taphoa-sales-redesign\.css"/);
  const sales=await read('src/screens/sales.js');
  assert.match(sales,/sales-main-context/);
  assert.match(sales,/sales-price-stack/);
  assert.match(sales,/sales-cart-header-copy/);
});

test('Sales source hierarchy is customer search groups data and cart, not one framed card',async()=>{
  const sales=await read('src/screens/sales.js');
  assert.match(sales,/sales-customer-bar/);
  assert.match(sales,/sales-search-tools/);
  assert.match(sales,/sales-group-rail/);
  assert.match(sales,/sales-products-region/);
  assert.match(sales,/sales-cart-summary/);
});

test('production build stays platform-neutral and emits the current static app',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=await read('scripts/build-current.mjs');
  assert.match(pkg.scripts['build:production'],/ui:build/);
  assert.match(pkg.scripts['build:production'],/build-current\.mjs/);
  for(const required of ["cp('index.html','dist/index.html')","cp('version.json','dist/version.json')","cp('sw.js','dist/sw.js')","cp('src','dist/src',{recursive:true})"]){
    assert.ok(build.includes(required),`production build missing ${required}`);
  }
});

test('production smoke proves the live build identity and current visual asset',async()=>{
  const workflow=await read('.github/workflows/taphoa-production-cutover-smoke.yml');
  for(const required of ['version.json?cb=','src/styles/taphoa-tailwind.css?cb=','app-build-id','build_id','TAPHOA_TH2_LAYOUT_V1']){
    assert.ok(workflow.includes(required),`smoke missing ${required}`);
  }
  assert.match(workflow,/github\.actor\s*!=\s*'github-actions\[bot\]'/);
});

test('production build stamps app-build-id and version.json from deployment SHA',async()=>{
  const build=await read('scripts/build-current.mjs');
  assert.match(build,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(build,/app-build-id/);
  assert.match(build,/dist\/version\.json/);
  const workflow=await read('.github/workflows/publish-version-marker.yml');
  assert.doesNotMatch(workflow,/git push/);
});
