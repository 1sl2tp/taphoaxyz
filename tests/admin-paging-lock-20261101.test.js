import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('both admin catalog pagers disable immediately when a request begins',()=>{
 assert.match(page,/SPEC-ADMIN-PAGER-LOCK-20261101/);
 assert.match(page,/marketLoading=true;\s*\/\/[\s\S]*?\$\('marketPrevBtn'\)\.disabled=true;\s*\$\('marketNextBtn'\)\.disabled=true/);
 assert.match(page,/loading=true;\s*updatePager\(\);\s*const sessionGeneration=catalogSessionGeneration/);
});
test('rapid paging cannot increment an offset while loading',()=>{
 assert.match(page,/\$\('marketNextBtn'\)\.addEventListener\('click',\(\)=>\{\s*if\(marketLoading\|\|marketOffset\+MARKET_PAGE_SIZE>=marketTotal\)return/);
 assert.match(page,/\$\('marketPrevBtn'\)\.addEventListener\('click',\(\)=>\{\s*if\(marketLoading\|\|marketOffset<=0\)return/);
 assert.match(page,/\$\('nextBtn'\)\.addEventListener\('click',\(\)=>\{\s*if\(loading\|\|offset\+PAGE_SIZE>=total\)return/);
 assert.match(page,/\$\('prevBtn'\)\.addEventListener\('click',\(\)=>\{\s*if\(loading\|\|offset<=0\)return/);
});
