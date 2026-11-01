import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/fixed-ui-product-media.js',import.meta.url),'utf8');
const start=src.indexOf('  // SPEC-MEDIA-MUTATION-OWNER-20261101:');
const end=src.indexOf('  window.openProductImageManager=function(){',start);
assert.ok(start>0&&end>start);
function fixture(){
 const pending=[],events=[],state={uid:'A',selected:'SKU-1'};
 const document={
  getElementById(id){
   if(id==='productImageProductSearch')return{value:''};
   if(id==='productImageClearButton')return{classList:{add:()=>events.push('clearButton'),toggle:()=>events.push('button')}};
   return null;
  }
 };
 const ctx=vm.createContext({pending,events,state,document,Promise,console});
 vm.runInContext(`
  let imageMutationBusy=false,activeProductCode='SKU-1',pickerGeneration=1;
  const currentMediaUser=()=>state.uid;
  const mediaSelectionCurrent=(code,uid,generation)=>code===activeProductCode&&
    uid===state.uid&&generation===pickerGeneration;
  const prod=()=>({
    setProductMedia:(code,id)=>{events.push('set:'+code+':'+id);return new Promise(resolve=>pending.push(resolve));},
    clearProductMedia:code=>{events.push('clear:'+code);return new Promise(resolve=>pending.push(resolve));}
  });
  const window={SheetDB:{read:async()=>events.push('refresh')}};
  const SheetDB=window.SheetDB;
  const stateProducts=()=>[];
  const productCode=x=>x?.id||'';
  const productImage=()=>false;
  const renderProducts=()=>events.push('renderProducts');
  const renderSelectedMarketSummary=()=>events.push('renderSummary');
  const showToast=()=>events.push('toast'),showLoading=()=>{},hideLoading=()=>{};
  ${src.slice(start,end)}
  globalThis.api={
    chooseCandidate,clearSelectedImage,
    switchProduct:code=>activeProductCode=code,
    switchAccount:uid=>state.uid=uid
  };
 `,ctx);
 return {api:ctx.api,pending,events};
}
test('delayed image save for SKU-1 cannot repaint SKU-2',async()=>{
 const f=fixture();
 const first=f.api.chooseCandidate('image-1');
 const duplicate=f.api.chooseCandidate('image-2');
 assert.deepEqual(f.events,['set:SKU-1:image-1']);
 f.api.switchProduct('SKU-2');
 f.pending[0]();await Promise.all([first,duplicate]);
 assert.deepEqual(f.events,['set:SKU-1:image-1']);
});
test('delayed clear from previous account cannot refresh new account',async()=>{
 const f=fixture(),job=f.api.clearSelectedImage();
 f.api.switchAccount('B');f.pending[0]();await job;
 assert.deepEqual(f.events,['clear:SKU-1']);
});
test('QC autosaves capture intended product before their timeout fires',()=>{
 assert.match(src,/compareTimer=setTimeout\(\(\)=>persistMarketCompare\(kind,qc,code\),350\)/);
 assert.match(src,/ownQcTimer=setTimeout\(\(\)=>persistOwnQc\(qc,code\),350\)/);
 assert.match(src,/setProductMediaCompare\?\.\(code,kind,qc\)/);
 assert.match(src,/setProductMediaOwnQc\?\.\(code,qc\)/);
});
