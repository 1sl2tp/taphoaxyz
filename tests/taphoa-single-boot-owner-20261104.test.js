import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-BOOT-OWNER-20261104. Only authenticated production startup may
// open account data. The preview window.onload used to run a second,
// pre-auth bootstrap while DOMContentLoaded awaited verified access.
// If navigator.onLine reported false and no snapshot existed, this raised
// "Chưa có dữ liệu đã lưu cho tài khoản này" even though server data was not lost.
const legacy=readFileSync(new URL('../src/fixed-ui-runtime-4.js',import.meta.url),'utf8');
const production=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const begin=legacy.indexOf('window.onload = function() {');
const end=legacy.indexOf('\n        };',begin);
assert.ok(begin>0&&end>begin,'legacy preview onload must exist');
const onloadSource=legacy.slice(begin,end+11);

function fixture({productionMode=false,online=true}={}){
  const actions=[];
  const window={TAPHOA_PRODUCTION:productionMode?{getIdentity(){return null;}}:null};
  const ctx={
    window,SheetDB:{API_URL:productionMode?'taphoa://production':'preview://sheets'},
    navigator:{onLine:online},
    localStorage:{getItem(k){actions.push('local:'+k);return '1';}},
    document:{getElementById(k){actions.push('dom:'+k);return null;}},
    loadUiPreferences(){actions.push('preferences');},
    showAppScreen(){actions.push('show-app');},
    showLoginScreen(){actions.push('show-login');},
    loadData(){actions.push('read-business-data');},
    currentAuthRole:'admin'
  };
  vm.createContext(ctx);
  vm.runInContext(onloadSource,ctx);
  return{window,ctx,actions};
}

test('production cold start never executes preview load, even if navigator reports offline',()=>{
  const f=fixture({productionMode:true,online:false});
  f.window.onload();
  assert.deepEqual(f.actions,[],
    'the login/restore owner alone must decide when it is safe to show and load account data');
});
test('production SheetDB sentinel also blocks preview onload if bridge module is late',()=>{
  const f=fixture({productionMode:true,online:true});
  f.window.TAPHOA_PRODUCTION=null;
  f.window.onload();
  assert.deepEqual(f.actions,[]);
});
test('nonproduction preview keeps its original one-time initializer',()=>{
  const f=fixture({productionMode:false,online:true});
  f.window.onload();
  assert.deepEqual(f.actions,[
    'preferences','dom:inputScriptUrl','local:APP_LOGIN','local:APP_ROLE',
    'show-app','read-business-data'
  ]);
});
test('production auth restore remains sole owner of display and projection',()=>{
  assert.match(production,/document\.addEventListener\('DOMContentLoaded',async function\(\)/);
  assert.match(production,/const info=await backend\(\)\.restore\(\);/);
  assert.match(production,/if\(!info\)\{showLoginScreen\(\);return;\}/);
  assert.match(production,/await refreshFixedSheets\(\);\s*showAppScreen\(\);/);
  assert.match(legacy,/if \(window\.TAPHOA_PRODUCTION \|\| SheetDB\.API_URL === 'taphoa:\/\/production'\) return;/);
  assert.match(html,/fixed-ui-runtime-4\.js[^"]*boot-owner=20261104/);
});
