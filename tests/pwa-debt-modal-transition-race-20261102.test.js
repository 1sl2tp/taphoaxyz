import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const r=read('src/fixed-ui-runtime-12.js'),b=read('src/fixed-ui-behavior.js'),html=read('index.html');
const i=r.indexOf('function nextCustomerDebtModalTransition('),j=r.indexOf('// Generate ONE debt PNG',i);
const k=b.indexOf('openCustomerDebtModal = function(maKh,'),m=b.indexOf('// Page loader renders cached server data',k);
assert(i>=0&&j>i&&k>=0&&m>k);
function setup(){
 const tasks=[];
 function element(){
  const classes=new Set(['hidden','opacity-0','pointer-events-none','translate-y-full']);
  return {dataset:{},className:'',scrollTop:0,innerHTML:'',innerText:'',
   classList:{add(...x){x.forEach(v=>classes.add(v));},remove(...x){x.forEach(v=>classes.delete(v));},
    contains(x){return classes.has(x);}}};
 }
 const nodes=Object.fromEntries(['cDebtModalName','cDebtModalTotal','cDebtModalBalanceLabel',
  'cDebtModalHistoryList','customerDebtModalWrapper','customerDebtBottomSheet'].map(n=>[n,element()]));
 const ctx={document:{getElementById:n=>nodes[n]},
  window:{customerDebtHistoryData:{sam:[],other:[]},customerDebtCurrentBalanceData:{sam:0,other:0}},
  appData:{khachhang:[['id','name'],['sam','C Sâm'],['other','Khách khác']]},
  activeDebtCustomerId:null,hasPermission:()=>true,denyPermission(){throw Error('denied');},
  escapeProductEditorValue:v=>String(v),setTimeout:(fn,delay)=>tasks.push({fn,delay})};
 vm.createContext(ctx);vm.runInContext(r.slice(i,j),ctx);vm.runInContext(b.slice(k,m),ctx);
 const run=ms=>{const x=tasks.findIndex(t=>t.delay===ms);
  assert(x>=0,'expected '+ms+'ms timer');tasks.splice(x,1)[0].fn();};
 return {ctx,nodes,tasks,run};
}
test('close before opening animation cannot reveal a closed modal',()=>{
 const x=setup();x.ctx.openCustomerDebtModal('sam');x.ctx.closeCustomerDebtModal();
 x.run(10);
 assert(x.nodes.customerDebtModalWrapper.classList.contains('pointer-events-none'));
 assert(x.nodes.customerDebtBottomSheet.classList.contains('translate-y-full'));
 x.run(300);x.run(300);
 assert(x.nodes.customerDebtModalWrapper.classList.contains('hidden'));
});
test('new customer cannot be hidden by an old first-stage close timer',()=>{
 const x=setup();x.ctx.openCustomerDebtModal('sam');x.run(10);x.ctx.closeCustomerDebtModal();
 x.ctx.openCustomerDebtModal('other');x.run(300);x.run(10);
 assert.equal(x.ctx.activeDebtCustomerId,'other');
 assert(!x.nodes.customerDebtModalWrapper.classList.contains('hidden'));
 assert(!x.nodes.customerDebtModalWrapper.classList.contains('pointer-events-none'));
 assert(!x.nodes.customerDebtBottomSheet.classList.contains('translate-y-full'));
 assert.equal(x.tasks.length,0,'stale closing stage does not schedule new timers');
});
test('reopen cancels a pending second-stage hide timer',()=>{
 const x=setup();x.ctx.openCustomerDebtModal('sam');x.run(10);x.ctx.closeCustomerDebtModal();
 x.run(300);x.ctx.openCustomerDebtModal('other');x.run(10);x.run(300);
 assert(!x.nodes.customerDebtModalWrapper.classList.contains('hidden'));
 assert(!x.nodes.customerDebtModalWrapper.classList.contains('opacity-0'));
});
test('both source owners and PWA cache version share the transition epoch',()=>{
 assert(r.includes('function nextCustomerDebtModalTransition(wrapper)'));
 assert(b.includes('nextCustomerDebtModalTransition(wrapper)'));
 assert.match(html,/fixed-ui-runtime-12\.js[^\n]*debt-modal-transition=20261102/);
 assert.match(html,/fixed-ui-behavior\.js[^\n]*debt-modal-transition=20261102/);
});
