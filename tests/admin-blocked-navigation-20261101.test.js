import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const from=page.indexOf('    // SPEC-ADMIN-INVALID-EDIT-NAV-20261101:');
const to=page.indexOf('    async function loadPage(reset=false){',from);
assert.ok(from>=0&&to>from);
function fixture(){
 const input={value:'changed search'},state={rendered:0,input};
 const ctx=vm.createContext({state});
 vm.runInContext(`
   let lastRenderedCatalog={offset:100,source:'stock',query:'original search'};
   let offset=200,selectedSource='wrong source';
   const $=id=>state.input;
   const renderSources=()=>{state.rendered++};
   ${page.slice(from,to)}
   globalThis.api={restoreBlockedCatalogNavigation,filters:()=>({offset,selectedSource})};
 `,ctx);
 return {state,api:ctx.api};
}
test('blocked navigation restores the actual rendered source, search and page',()=>{
 const f=fixture();
 f.api.restoreBlockedCatalogNavigation();
 assert.equal(f.api.filters().offset,100);
 assert.equal(f.api.filters().selectedSource,'stock');
 assert.equal(f.state.input.value,'original search');
 assert.equal(f.state.rendered,1);
});
test('catalog saves the display snapshot only after rendering successful data',()=>{
 assert.match(page,/lastRenderedCatalog=\{offset,source:selectedSource,query\}/);
 assert.match(page,/if\(blocked\)\{\s*pageRefreshQueued=false;pageRefreshReset=false;\s*restoreBlockedCatalogNavigation\(\);\s*updatePager\(\)/);
 assert.match(page,/lastRenderedCatalog=\{offset:0,source:'',query:''\}/);
});
