import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=source.indexOf('    // SPEC-ADMIN-MARKET-LOAD-RECOVERY-20261101:');
const end=source.indexOf('\n    async function selectMarketProduct(code)',start);
assert.ok(start>=0&&end>start);
const fn=source.slice(start,end);
function fixture(rpcImpl){
 const el={
  marketMapCount:{textContent:''},
  marketProductList:{innerHTML:''},
  marketOwnSearch:{value:''},
  marketOwnSource:{value:''},
  marketPrevBtn:{disabled:false},
  marketNextBtn:{disabled:false},
  marketPageText:{textContent:''}
 };
 const state={el,calls:[],rendered:[],rpcImpl};
 const ctx=vm.createContext({state,Number,Array,Promise,console});
 vm.runInContext(`
   let marketLoading=false,marketRefreshQueued=false,marketRefreshReset=false,marketOffset=0,
     marketItems=[{product_code:'old'}],marketSources=[],marketTotal=1,marketSelectedCode='old';
   const MARKET_PAGE_SIZE=100;
   const $=id=>state.el[id];
   const rpc=async(name,args)=>{state.calls.push(args);return state.rpcImpl(args);};
   const renderMarketSourceOptions=()=>{};
   const renderMarketCurrent=()=>{};
   const renderMarketProducts=()=>{state.rendered.push(marketItems.map(x=>x.product_code));};
   ${fn}
   globalThis.api={loadMarketMappings,rows:()=>marketItems,loading:()=>marketLoading};
 `,ctx);
 return {state,api:ctx.api};
}
test('a failed market catalog request shows an actionable error instead of old products',async()=>{
 const f=fixture(async()=>{throw new Error('offline');});
 await f.api.loadMarketMappings(true);
 assert.equal(f.api.rows().length,0);
 assert.equal(f.state.rendered.length,0);
 assert.match(f.state.el.marketProductList.innerHTML,/Không tải được dữ liệu/);
 assert.equal(f.state.el.marketPrevBtn.disabled,true);
 assert.equal(f.state.el.marketNextBtn.disabled,true);
});
test('the most recent filter wins over a slow earlier result',async()=>{
 let resolveFirst;
 const oldRequest=new Promise(resolve=>{resolveFirst=resolve;});
 let call=0;
 const f=fixture(async()=>++call===1?oldRequest:{items:[{product_code:'new'}],total:1,sources:[]});
 const first=f.api.loadMarketMappings(true);
 f.state.el.marketOwnSearch.value='mới';
 await f.api.loadMarketMappings(true);
 resolveFirst({items:[{product_code:'old'}],total:1,sources:[]});
 await first;
 for(let i=0;i<10&&!f.state.rendered.length;i++)await Promise.resolve();
 assert.deepEqual(Array.from(f.api.rows(),x=>x.product_code),['new']);
 assert.deepEqual(Array.from(f.state.rendered.at(-1)),['new']);
 assert.equal(f.state.calls[1].p_query,'mới');
});
