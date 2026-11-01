import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/fixed-ui-product-media.js',import.meta.url),'utf8');
const start=src.indexOf('  async function loadCandidates(query){');
const end=src.indexOf('  async function chooseCandidate(id){',start);
assert.ok(start>0&&end>start);
test('old candidate search result cannot replace newer query or selection',async()=>{
 const releases=[],list={innerHTML:''};
 const state={list,owner:'admin-1'};
 const ctx=vm.createContext({state,releases,Promise,console});
 vm.runInContext(`
   let candidateRequestGeneration=0,pickerGeneration=1,activeProductCode='A';
   const document={getElementById:()=>state.list};
   const currentMediaUser=()=>state.owner;
   const mediaSelectionCurrent=(code,user,generation)=>activeProductCode===code&&
     user===state.owner&&generation===pickerGeneration;
   const prod=()=>({productMediaCandidates:()=>new Promise(resolve=>releases.push(resolve))});
   const candidateMeta=()=>'',candidatePriceHtml=()=>'',sourceHost=()=>'',safeMediaUrl=()=>'',esc=x=>x;
   ${src.slice(start,end)}
   globalThis.api={loadCandidates};
 `,ctx);
 const a=ctx.api.loadCandidates('A'),b=ctx.api.loadCandidates('B');
 releases[1]([{id:'B',name:'New image'}]);await b;
 const fresh=list.innerHTML;assert.match(fresh,/New image/);
 releases[0]([{id:'A',name:'Old image'}]);await a;
 assert.equal(list.innerHTML,fresh);
});
test('typing, product changes and picker closing invalidate old searches immediately',()=>{
 assert.match(src,/candidateRequestGeneration\+\+; \/\/ invalidate reply as soon as/);
 assert.match(src,/const requestGeneration=\+\+candidateRequestGeneration/);
 assert.match(src,/if\(!isCurrent\(\)\)return;\s*const candidates=/);
 assert.match(src,/pickerGeneration\+\+;candidateRequestGeneration\+\+/);
});
test('market images and source URLs are restricted to web protocols',()=>{
 const helper=src.slice(src.indexOf('  const safeMediaUrl=value=>'),src.indexOf('\n  function isEnabled(){'));
 const ctx=vm.createContext({URL});
 vm.runInContext(helper+'\nglobalThis.guard=safeMediaUrl;',ctx);
 assert.equal(ctx.guard('https://example.com/a'),'https://example.com/a');
 assert.equal(ctx.guard('javascript:alert(1)'),'');
 assert.equal(ctx.guard('data:image/svg+xml,test'),'');
 assert.equal(ctx.guard('https://example.com\n'),'');
 assert.match(src,/const src=safeMediaUrl\(productImage\(product\)\)/);
 assert.match(src,/image=safeMediaUrl\(row\?\.image_url\)/);
});
