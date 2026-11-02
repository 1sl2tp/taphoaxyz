import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// SPEC-SOURCE-DETAIL-OWNER-20261103. Source names, pending order notes and
// amounts stay canonical. Only stale modal UI work is rejected.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('src/fixed-ui-runtime-9.js');
const html=read('index.html');
const i=src.indexOf('function nextSourceDetailModalEpoch(');
const j=src.indexOf('function switchSourceDetailTab(',i);
const editStart=src.indexOf('async function commitSourceLineNoteEditor(');
const editEnd=src.indexOf('function buildSourceCaptureHeaderHtml(',editStart);
assert(i>0&&j>i&&editStart>j&&editEnd>editStart);
function fixture(){
 const frames=[],timers=[],saved=[],toasts=[],alerts=[];
 const classes=names=>({value:new Set(names),contains(x){return this.value.has(x);},
  add(...a){a.forEach(x=>this.value.add(x));},remove(...a){a.forEach(x=>this.value.delete(x));}});
 const modal={dataset:{},classList:classes(['hidden','opacity-0','pointer-events-none'])};
 const card={classList:classes(['translate-y-full'])};
 let displays=0;
 const doc={getElementById(id){return id==='sourceDetailModalWrapper'?modal:
   id==='sourceDetailModalCard'?card:null;}};
 const ctx={activeSourceDetailState:null,document:doc,
  requestAnimationFrame(fn){frames.push(fn);},
  setTimeout(fn){timers.push(fn);},
  buildSourceDetailData(sheetName,source){return {detailRows:[],groupedRows:[],totalQty:0,timeLabel:source};},
  promoteSourceDetailModalLayer:()=>modal,
  renderSourceDetailModal(){displays++;},switchSourceDetailTab(){},
  showToast(...a){toasts.push(a);},showAlertPopup(...a){alerts.push(a);},
  console:{error(){}}};
 vm.createContext(ctx);
 vm.runInContext(src.slice(i,j),ctx,{timeout:1000});
 vm.runInContext(src.slice(editStart,editEnd),ctx,{timeout:1000});
 const runFrame=()=>{assert(frames.length);frames.shift()();};
 const runTimer=()=>{assert(timers.length);timers.shift()();};
 return {ctx,modal,card,frames,timers,runFrame,runTimer,toasts,alerts,get displays(){return displays;}};
}
test('reopening another source cancels an old closing timeout',()=>{
 const f=fixture();f.ctx.openSourceDetail('dontam','Nguồn A');f.runFrame();
 f.ctx.closeSourceDetailModal();f.ctx.openSourceDetail('dontam','Nguồn B');
 f.runTimer();f.runFrame();
 assert(!f.modal.classList.contains('hidden'));
 assert(!f.card.classList.contains('translate-y-full'));
 assert.equal(f.ctx.activeSourceDetailState.source,'Nguồn B');
});
test('late opening animation cannot reveal a closed source card',()=>{
 const f=fixture();f.ctx.openSourceDetail('dontam','Nguồn A');
 f.ctx.closeSourceDetailModal();f.runFrame();f.runTimer();
 assert(f.card.classList.contains('translate-y-full'));
 assert(f.modal.classList.contains('hidden'));
});
test('old pending note save cannot repaint or toast over another source',async()=>{
 const f=fixture();f.ctx.openSourceDetail('dontam','Nguồn A');f.runFrame();
 let resolve;
 f.ctx.window={savePendingOrderItemNoteDirect:()=>new Promise(done=>{resolve=done;})};
 const input={dataset:{noteCurrent:'old',noteOrderId:'orderA',noteProductCode:'P1'},
  value:'new note',disabled:false};
 const pending=f.ctx.commitSourceLineNoteEditor(input);
 assert.equal(input.disabled,true);
 f.ctx.openSourceDetail('dontam','Nguồn B');f.runFrame();
 const count=f.displays;resolve(true);await pending;
 assert.equal(f.ctx.activeSourceDetailState.source,'Nguồn B');
 assert.equal(f.displays,count,'old save must not redraw the new source');
 assert.equal(f.toasts.length,0);
 assert.equal(f.alerts.length,0);
});
test('same source save still refreshes its current detail',async()=>{
 const f=fixture();f.ctx.openSourceDetail('dontam','Nguồn A');f.runFrame();
 f.ctx.window={savePendingOrderItemNoteDirect:async()=>true};
 const input={dataset:{noteCurrent:'old',noteOrderId:'orderA',noteProductCode:'P1'},value:'new'};
 const before=f.displays;
 await f.ctx.commitSourceLineNoteEditor(input);
 assert.equal(f.displays,before+1);
 assert.equal(f.toasts.length,1);
});
test('PWA runtime query identifies the current source owner code',()=>{
 assert.match(html,/fixed-ui-runtime-9\.js[^\n]*source-modal-epoch=20261103/);
});
