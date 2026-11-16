import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/fixed-pwa-auto-update.js','utf8');
function createHarness({
  runningBuild='source-main',
  serverBuild='source-main',
  localAssets=['./src/fixed-ui-runtime-6.js?v=old'],
  remoteAssets=['./src/fixed-ui-runtime-6.js?v=new'],
  blockWorker=false
}={}){
  const fetched=[],replaced=[],state=new Map(),listeners={};
  let notice=null;
  function makeHead(assets){
    return {querySelectorAll(){
      return assets.map(src=>({tagName:'SCRIPT',getAttribute:name=>name==='src'?src:null}));
    }};
  }
  const document={
    hidden:false,visibilityState:'visible',activeElement:null,
    head:makeHead(localAssets),
    body:{appendChild(button){notice=button;}},
    querySelector:q=>q==='meta[name="app-build-id"]'?{content:runningBuild}:null,
    getElementById:id=>id==='taphoa-update-notice'?notice:null,
    createElement:tag=>{
      assert.equal(tag,'button');
      return {style:{},hidden:false,events:{},
        setAttribute(){},addEventListener(type,callback){this.events[type]=callback;},
        remove(){notice=null;}
      };
    },
    addEventListener(type,callback){listeners[type]=callback;}
  };
  const window={
    TAPHOA_PRODUCTION:{getIdentity:()=>({uid:'admin'})},
    addEventListener(type,callback){listeners[type]=callback;}
  };
  const ctx={
    document,window,
    navigator:blockWorker?{serviceWorker:{
      addEventListener(){},
      register:()=>new Promise(()=>{})  // iOS SW registration can remain pending
    }}:{},
    sessionStorage:{
      getItem:key=>state.get(key)||null,
      setItem:(key,value)=>state.set(key,value),
      removeItem:key=>state.delete(key)
    },
    history:{replaceState(){}},
    location:{
      href:'https://app.taphoa.xyz/',
      origin:'https://app.taphoa.xyz',
      replace:url=>replaced.push(url),
      reload:()=>replaced.push('reload')
    },
    DOMParser:class {
      parseFromString(){return {head:makeHead(remoteAssets)};}
    },
    fetch:async url=>{
      fetched.push(String(url));
      if(String(url).includes('version.json')){
        return {ok:true,json:async()=>({build_id:serverBuild})};
      }
      if(String(url).includes('index.html')){
        return {ok:true,text:async()=>'<html><head>updated</head></html>'};
      }
      throw Error('unexpected URL '+url);
    },
    URL,Date,Math,Number,String,Boolean,Error,Array,Promise
  };
  vm.runInNewContext(source,ctx);
  return {
    ctx,fetched,replaced,state,notice:()=>notice,
    check:()=>ctx.window.TAPHOA_PWA_UPDATE.check(),
    settle:()=>new Promise(resolve=>setImmediate(resolve))
  };
}

test('changed source-only release displays visible update without a build hash',async()=>{
  const h=createHarness();
  const result=await h.check();
  assert.equal(result.updated,true);
  assert.equal(result.source,true);
  assert.equal(h.notice()?.textContent,'Có bản mới · Cập nhật');
  assert.equal(h.notice()?.hidden,false);
  assert.equal(h.replaced.length,0,'authenticated work is never auto-reloaded');
  assert.match(h.state.get('taphoa-pwa-update-pending'),/^source-/);
  h.notice().events.click();
  assert.equal(h.replaced.length,1,'explicit click navigates to a fresh shell');
  assert.match(h.replaced[0],/__taphoa_build=source-/);
});

test('unchanged source-only release does not announce a false new version',async()=>{
  const assets=['./src/fixed-ui-runtime-6.js?v=same'];
  const h=createHarness({localAssets:assets,remoteAssets:assets});
  const result=await h.check();
  assert.equal(result.updated,false);
  assert.equal(result.source,true);
  assert.equal(h.notice(),null);
});

test('hashed canonical builds check only version manifest when unchanged',async()=>{
  const h=createHarness({runningBuild:'content-123abc',serverBuild:'content-123abc'});
  const result=await h.check();
  assert.equal(result.updated,false);
  assert.equal(h.fetched.filter(x=>x.includes('index.html')).length,0);
  assert.equal(h.notice(),null);
});

test('source-main server response cannot downgrade a running canonical build',async()=>{
  const h=createHarness({runningBuild:'content-123abc',serverBuild:'source-main'});
  const result=await h.check();
  assert.equal(result.error,'server-build-unverified');
  assert.equal(h.notice(),null);
});

test('version detection is independent of a hanging iPhone SW registration',async()=>{
  const h=createHarness({blockWorker:true});
  await h.settle();
  assert(h.fetched.some(x=>x.includes('version.json')));
  assert.equal(h.notice()?.textContent,'Có bản mới · Cập nhật');
  assert.equal(h.replaced.length,0);
});
