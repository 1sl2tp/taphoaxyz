import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installImeInputStability} from '../src/core/ime-stability.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function harness(){
  const listeners=new Map();
  const root={
    addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(x=>x!==fn));}
  };
  const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};
  return {root,emit};
}

function textTarget(){
  const dispatched=[];
  return {
    isConnected:true,
    matches:selector=>selector.includes('input'),
    dispatchEvent:event=>{dispatched.push(event.type);return true;},
    dispatched
  };
}

test('IME guard suppresses intermediate input events and commits once composition ends',()=>{
  const {root,emit}=harness();
  const queued=[];
  installImeInputStability(root,fn=>{queued.push(fn);return 1;});
  const target=textTarget();
  emit('compositionstart',{target});
  let stopped=false;
  emit('input',{target,isComposing:true,stopImmediatePropagation(){stopped=true;}});
  assert.equal(stopped,true);
  emit('compositionend',{target});
  assert.equal(queued.length,1);
  queued[0]();
  assert.deepEqual(target.dispatched,['input']);
});

test('IME guard does not synthesize a duplicate commit when browser emits final input',()=>{
  const {root,emit}=harness();
  const queued=[];
  installImeInputStability(root,fn=>{queued.push(fn);return 1;});
  const target=textTarget();
  emit('compositionstart',{target});
  emit('compositionend',{target});
  let stopped=false;
  emit('input',{target,isComposing:false,stopImmediatePropagation(){stopped=true;}});
  assert.equal(stopped,false);
  queued[0]();
  assert.deepEqual(target.dispatched,[]);
});

test('IME stability module loads before application input handlers',()=>{
  const html=read('index.html');
  const guard=html.indexOf('./src/core/ime-stability.js');
  const app=html.indexOf('./src/app.js');
  assert.ok(guard>=0&&app>guard);
});

test('sales search keeps the active input mounted while filtering products',()=>{
  const source=read('src/screens/sales.js');
  assert.match(source,/const refreshSalesSearchResults=\(\)=>\{/);
  assert.match(source,/querySelector\('\.sales-product-list'\)/);
  assert.match(source,/productList\.innerHTML=productRows\(state\)/);
  assert.match(source,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{state=\{\.\.\.state,search:event\.target\.value\};refreshSalesSearchResults\(\);return;\}/);
  assert.doesNotMatch(source,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{[^\n]*render\(\)/);
});
