import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=html.indexOf('    function switchAdminView(view){');
const end=html.indexOf("\n\n    const analyticsNumber=",start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
function fixture(){
 const nodes=new Map(['goodsTabBtn','marketTabBtn','analyticsTabBtn','customerCareTabBtn','goodsPane','marketPane','analyticsPane','customerCarePane'].map(id=>[id,{
  classList:{toggle(){}}
 }]));
 const state={nodes,timers:new Map(),lastId:0,requests:[],resolvers:[],analytics:0,care:0};
 const ctx=vm.createContext({state,Promise});
 vm.runInContext(`
  let adminView='goods',marketPollingGeneration=0,marketStatusTimer=0,identity={role:'admin'};
  const $=id=>state.nodes.get(id);
  const clearTimeout=id=>state.timers.delete(id);
  const setTimeout=(fn,ms)=>{const id=++state.lastId;state.timers.set(id,fn);return id;};
  const loadMarketMappings=()=>{};
  const loadMarketStatus=()=>{state.requests.push('market');return new Promise(resolve=>state.resolvers.push(resolve));};
  const loadQuoteAnalytics=()=>state.analytics++;
  const customerCare={load:()=>state.care++};
  ${source}
  globalThis.api={switchAdminView,timer:()=>marketStatusTimer};
 `,ctx);
 return {state,api:ctx.api};
}
test('switching away and back cannot revive an older market polling timer',async()=>{
 const f=fixture();
 f.api.switchAdminView('market');
 const firstTimer=f.api.timer();
 const tick1=f.state.timers.get(firstTimer);
 f.state.timers.delete(firstTimer); // Native setTimeout removes callbacks once fired.
 tick1();
 assert.equal(f.state.requests.length,2);
 f.api.switchAdminView('goods');
 f.api.switchAdminView('market');
 assert.equal(f.state.requests.length,3);
 const current=f.api.timer();
 f.state.resolvers[1](); // Complete the old tab's in-flight polling request.
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.api.timer(),current);
 assert.equal(f.state.timers.has(current),true);
 assert.equal(f.state.timers.size,1);
});
test('reset clears delayed searches as well as the market timer',()=>{
 assert.match(html,/SPEC-ADMIN-POLL-OWNER-20261101/);
 assert.match(html,/clearTimeout\(searchTimer\);clearTimeout\(marketSearchTimer\);clearTimeout\(marketCandidateTimer\)/);
 assert.match(html,/\+\+marketPollingGeneration/);
});
