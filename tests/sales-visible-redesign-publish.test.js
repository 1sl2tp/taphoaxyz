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

test('GitHub Pages production workflow builds and deploys dist from main',async()=>{
  const workflow=await read('.github/workflows/deploy-github-pages.yml');
  for(const required of ['actions/configure-pages@','actions/upload-pages-artifact@','actions/deploy-pages@','npm run build:production','path: ./dist','pages: write','id-token: write']){
    assert.ok(workflow.includes(required),`Pages deploy missing ${required}`);
  }
  assert.match(workflow,/branches:\s*\[main\]/);
});

test('production smoke proves the live build identity and current visual asset',async()=>{
  const workflow=await read('.github/workflows/taphoa-production-cutover-smoke.yml');
  for(const required of ['version.json?cb=','src/styles/taphoa-tailwind.css?cb=','app-build-id','build_id','TAPHOA_SALES_LAYOUT_V2']){
    assert.ok(workflow.includes(required),`smoke missing ${required}`);
  }
  assert.match(workflow,/github\.actor\s*!=\s*'github-actions\[bot\]'/);
});

test('publish marker keeps index app-build-id synchronized with version.json',async()=>{
  const workflow=await read('.github/workflows/publish-version-marker.yml');
  assert.match(workflow,/app-build-id/);
  assert.match(workflow,/index\.html/);
  assert.match(workflow,/GITHUB_SHA/);
});
