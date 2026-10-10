import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const voice=load('src/fixed-ui-no-hints.js');
const ncc=load('ncc/index.html');
const admin=load('admin-gia.html');
test('search selects once only on focus entry and never while composing',()=>{
 const start=voice.indexOf('  function isSearchInput(el){'),end=voice.indexOf('  /* UI-129',start);
 assert.ok(start>=0&&end>start);
 class Element{constructor(value='sữa chua'){this.tagName='INPUT';this.type='text';this.id='searchProductInput';this.value=value;this.disabled=false;this.readOnly=false;this.selectCalls=0;} getAttribute(){return null;}select(){this.selectCalls++;}}
 const ctx={Element,WeakSet,String};vm.createContext(ctx);
 vm.runInContext(voice.slice(start,end)+'\n globalThis.selectExistingSearchText=selectExistingSearchText; globalThis.composingSearchInputs=composingSearchInputs;',ctx);
 const input=new Element();
 ctx.selectExistingSearchText({type:'focusin',target:input});
 ctx.selectExistingSearchText({type:'click',target:input});
 assert.equal(input.selectCalls,1);
 ctx.composingSearchInputs.add(input);
 ctx.selectExistingSearchText({type:'focusin',target:input});
 assert.equal(input.selectCalls,1);
});
test('NCC never rewrites value on native input and waits for composed enter',()=>{
 const binder=ncc.slice(ncc.indexOf("  $('rows').querySelectorAll('input').forEach(input=>{"),ncc.indexOf('  updateSaveState();\n}',ncc.indexOf("  $('rows').querySelectorAll('input').forEach(input=>{")));
 assert.ok(binder.includes("input.addEventListener('input',()=>updateSaveState())"));
 assert.ok(!binder.includes('formatPriceWhileTyping(input)'));
 assert.ok(binder.includes('e.isComposing||e.keyCode===229||composing'));
 assert.ok(binder.includes('if(!composing)normalizePriceInput(input)'));
});
test('admin second click keeps numeric caret; composing Enter cannot blur',()=>{
 assert.ok(!admin.includes("if(e.target.matches('.cell-input'))e.target.select();\n      const row="));
 assert.match(admin,/e\.isComposing\|\|e\.keyCode===229\|\|e\.target\.dataset\.imeComposing/);
 assert.ok(!admin.includes("addEventListener('click',e=>e.target.select())"));
});
