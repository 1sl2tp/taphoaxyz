import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
test('clearing a custom reporting date invalidates the old in-flight report',()=>{
 assert.match(source,/SPEC-ADMIN-CARE-INCOMPLETE-DATES-20261101/);
 const start=source.indexOf("  for(const id of ['carePeriodStart','carePeriodEnd']){");
 const end=source.indexOf("\n  $('careSearch').addEventListener",start);
 assert.ok(start>=0&&end>start);
 const nodes={carePeriodStart:{value:'2026-10-01',handlers:{}},carePeriodEnd:{value:'2026-10-31',handlers:{}},
  careStatus:{textContent:''}};
 const state={nodes,refreshes:0};
 const ctx=vm.createContext({state});
 vm.runInContext(`
   let generation=12,loading=true,reloadQueued=true,loaded=true;
   const $=id=>state.nodes[id];
   for(const id of ['carePeriodStart','carePeriodEnd'])
     state.nodes[id].addEventListener=(type,handler)=>{state.nodes[id].handlers[type]=handler;};
   const refreshPeriod=()=>{state.refreshes++};
   const invalidatePeriodFigures=()=>{state.clears=(state.clears||0)+1;};
   ${source.slice(start,end)}
   globalThis.api={check:()=>({generation,loading,reloadQueued,loaded})};
 `,ctx);
 nodes.carePeriodEnd.value='';
 nodes.carePeriodEnd.handlers.change();
 assert.equal(ctx.api.check().generation,13);
 assert.equal(ctx.api.check().loading,false);
 assert.equal(ctx.api.check().reloadQueued,false);
 assert.equal(ctx.api.check().loaded,false);
 assert.equal(state.refreshes,0);
 assert.match(nodes.careStatus.textContent,/Chọn đủ hai ngày/);\n assert.equal(state.clears,1);
 nodes.carePeriodEnd.value='2026-10-30';
 nodes.carePeriodEnd.handlers.change();
 assert.equal(state.refreshes,1);
});
test('voice-setting response from a prior admin session is ignored',()=>{
 assert.match(source,/voiceSessionGeneration\+\+;savingVoice=false/);
 assert.match(source,/const sessionGeneration=voiceSessionGeneration,adminUid=getIdentity\(\)\?\.uid/);
 assert.match(source,/if\(sessionGeneration!==voiceSessionGeneration\|\|getIdentity\(\)\?\.uid!==adminUid\)return/);
});
