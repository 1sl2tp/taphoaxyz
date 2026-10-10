import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('installed PWA actively checks for a fresh build and service worker on launch',async()=>{
  const [html,updater,sw,version,build]=await Promise.all([
    readFile('index.html','utf8'),
    readFile('src/fixed-pwa-auto-update.js','utf8'),
    readFile('sw.js','utf8'),
    readFile('version.json','utf8'),
    readFile('scripts/build-current.mjs','utf8')
  ]);

  assert.match(html,/fixed-pwa-auto-update\.js\?v=pwa-auto-update-20260921/);
  assert.match(html,/ui137-safe-resume=20261010/);
  assert.match(updater,/if\(!safeToReload\(\)\)/);
  assert.match(updater,/userHasInteracted/);
  assert.match(updater,/TAPHOA_PRODUCTION\?\.getIdentity/);
  assert.doesNotMatch(html,/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);

  assert.match(updater,/updateViaCache:'none'/);
  assert.match(updater,/registration\.update\(\)/);
  assert.match(updater,/fetchServerVersion/);
  assert.match(updater,/cache:'no-store'/);
  assert.match(updater,/serverBuild===runningBuild/);
  assert.match(updater,/url\.searchParams\.set\(BUILD_QUERY,targetBuild\)/);
  assert.match(updater,/navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(updater,/window\.addEventListener\('pageshow'/);
  assert.match(updater,/document\.addEventListener\('visibilitychange'/);
  assert.match(updater,/attempts>=3/);
  assert.match(updater,/hasLiveCart\(\)/);

  assert.match(sw,/taphoa-runtime-v36/);
  assert.match(sw,/staleWhileRevalidate/);
  assert.match(sw,/url\.searchParams\.has\('v'\)/);
  assert.match(sw,/request\.mode==='navigate'/);
  assert.match(sw,/cache:'no-cache'/);
  assert.match(sw,/cache:'no-store'/);
  assert.match(sw,/self\.skipWaiting\(\)/);
  assert.match(sw,/self\.clients\.claim\(\)/);

  const parsedVersion=JSON.parse(version);
  assert.equal(parsedVersion.update_policy,'active-build-check-on-launch');
  assert.equal(parsedVersion.ui_fix,'pwa-active-auto-update');

  assert.match(build,/const buildId=\`content-\$\{digest\.digest\('hex'\)\.slice\(0,20\)\}\`/);
  assert.match(build,/version\.build_id=buildId/);
  assert.match(build,/index=index\.replace/);
});

test('UI-137 never reloads while user browses, edits or is authenticated',async()=>{
  const vm=await import('node:vm');
  const src=await readFile('src/fixed-pwa-auto-update.js','utf8');
  const listeners={doc:{},window:{},sw:{}};
  const replaces=[];
  const dom={hidden:false,visibilityState:'visible',activeElement:null,
    querySelector(sel){return sel==='meta[name="app-build-id"]'?{content:'old-build'}:null;},
    getElementById(){return null;},
    addEventListener(name,handler){listeners.doc[name]=handler;}
  };
  let loggedIn=true;
  const state=new Map();
  const context={
    document:dom,window:{TAPHOA_PRODUCTION:{getIdentity:()=>loggedIn},
      addEventListener(name,fn){listeners.window[name]=fn;}},
    navigator:{serviceWorker:{
      addEventListener(name,fn){listeners.sw[name]=fn;},
      register:async()=>({update:async()=>{},addEventListener(){},waiting:null})
    }},
    sessionStorage:{setItem(k,v){state.set(k,v)},getItem:k=>state.get(k)||null,removeItem:k=>state.delete(k)},
    location:{href:'https://app.taphoa.xyz/',replace(u){replaces.push(u)},reload(){replaces.push('reload')}},
    history:{replaceState(){}},URL,Date,Number,String,Boolean,Error,Math,
    fetch:async()=>({ok:true,json:async()=>({build_id:'next-build'})})
  };
  vm.runInNewContext(src,context);
  const ctrl=context.window.TAPHOA_PWA_UPDATE;
  assert.ok(ctrl);
  assert.equal(ctrl.safeToReload(),false,'authenticated page must not reload');
  await ctrl.check();
  assert.equal(replaces.length,0);
  assert.equal(state.get('taphoa-pwa-update-pending'),'next-build');
  loggedIn=false;
  dom.activeElement={tagName:'INPUT'};
  assert.equal(ctrl.safeToReload(),false,'focus protects the active edit');
  dom.activeElement=null;
  listeners.doc.pointerdown();
  assert.equal(ctrl.safeToReload(),false,'public browsing is protected too');
  assert.equal(replaces.length,0);
});
