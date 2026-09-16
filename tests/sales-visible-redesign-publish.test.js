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

test('production build stamps app-build-id and version.json from current content',async()=>{
  const build=await read('scripts/build-current.mjs');
  assert.match(build,/createHash\(['"]sha256['"]\)/);
  assert.match(build,/content-/);
  assert.match(build,/app-build-id/);
  assert.match(build,/dist\/version\.json/);
  assert.match(build,/main-content/);
  assert.doesNotMatch(build,/VERCEL_GIT_COMMIT_SHA|GITHUB_SHA/);
});
