import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-MARKET-PAGE-LOCK-20261101:');
const end=page.indexOf('    async function renameMarketProduct(){',start);
assert.ok(start>=0&&end>start);
const section=page.slice(start,end);
function fixture(){
 let release;const pending=new Promise(resolve=>release=resolve);
 const state={calls:[],deferred:false,count:{textContent:''},list:{innerHTML:''}};
 const ctx=vm.createContext({state,pending,Promise,console,Array});
 vm.runInContext(`
 let marketCandidateGeneration=0,marketCandidateLoadingMore=false,marketCandidateHasMore=true,
 marketCandidateOffset=120,marketCandidates=[{id:'a'}],marketSelectedCode='A';
 const selectedMarketItem=()=>({product_code:'A'});
 const $=id=>id==='marketCandidateCount'?state.count:
   id==='marketCandidateList'?state.list:{value:''};
 const marketSearchQuery=()=> 'fresh';
 const rpc=async(name,args)=>{
   state.calls.push({...args});
   return state.deferred?await pending:[{id:'b'}];
 };
 const sortMarketCandidates=xs=>xs.slice().reverse();
 const renderMarketCandidates=()=>{};
 const MARKET_CANDIDATE_PAGE_SIZE=120;
 ${section}
 globalThis.api={loadMarketCandidates,offset:()=>marketCandidateOffset};
 `,ctx);
 return {state,api:ctx.api,release};
}
test('two rapid requests for more candidates fetch only one page',async()=>{
 const f=fixture();f.state.deferred=true;
 const first=f.api.loadMarketCandidates(false);
 await f.api.loadMarketCandidates(false);
 assert.equal(f.state.calls.length,1);
 assert.equal(f.state.calls[0].p_offset,120);
 f.release([{id:'b'}]);
 await first;
 assert.equal(f.api.offset(),121);
});
test('market query invalidates pending searches as soon as user types',()=>{
 assert.match(page,/marketCandidateGeneration\+\+;\s*marketCandidateLoadingMore=false;\s*\$\('marketCandidateCount'\)\.textContent='Đang nhập từ khóa…'/);
 assert.match(page,/marketCandidateOffset=requestOffset\+batch\.length/);
});
