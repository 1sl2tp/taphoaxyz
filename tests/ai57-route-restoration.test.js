import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/fixed-ui-runtime-2.js',import.meta.url),'utf8');
const start=source.indexOf('        const appTabRoutes = new Set(');
const end=source.indexOf('        function switchTab(tabId, element) {',start);
const unit=source.slice(start,end);

test('AI-57: explicit TAPHOA tab hash restores without writing to business data',()=>{
  assert(start>=0&&end>start);
  let active='tab-ban-hang',pushes=0;
  const eventHandlers={};
  const location={pathname:'/',search:'?view=main',hash:'#/tab/tab-cong-no'};
  const history={state:{unchanged:true},pushState(state,title,url){
    pushes++;location.hash=url.slice(url.indexOf('#'));
  }};
  const tabs=['tab-ban-hang','tab-da-giao','tab-don-tam','tab-cong-no']
    .map(id=>({getAttribute:()=> "switchTab('"+id+"', this)"}));
  const document={readyState:'loading',addEventListener(name,fn){eventHandlers[name]=fn;},
    querySelector(selector){return selector==='.tab-content.active'?{id:active}:null;},
    querySelectorAll(selector){return selector==='.tab-btn'?tabs:[];}};
  const context={Set,String,location,history,document,window:{
    addEventListener(name,fn){eventHandlers[name]=fn;}
  },switchTab(tabId){active=tabId;}};
  vm.createContext(context);vm.runInContext(unit,context);
  assert.equal(vm.runInContext('appTabRouteFromUrl()',context),'tab-cong-no');
  assert.equal(vm.runInContext('restoreAppTabRoute()',context),true);
  assert.equal(active,'tab-cong-no');
  assert.equal(pushes,0,'F5 must never create a new history entry');
  vm.runInContext("syncAppTabRoute('tab-don-tam')",context);
  assert.equal(location.hash,'#/tab/tab-don-tam');
  assert.equal(pushes,1);
  eventHandlers.popstate();
  assert.equal(active,'tab-don-tam');
  assert.equal(pushes,1,'Back/Forward replay never re-pushes');
  location.hash='#/watch/video';
  vm.runInContext("syncAppTabRoute('tab-ban-hang')",context);
  assert.equal(location.hash,'#/watch/video','unrelated deep links must not be overwritten');
});

test('AI-57: tab route ownership keeps permission gate and does not serialize orders',()=>{
  assert.match(source,/function switchTab\(tabId, element\)/);
  assert.match(source,/hasPermission\('canViewDelivered'\)/);
  assert.match(source,/hasPermission\('canViewDebt'\)/);
  assert.match(source,/clearOrderPreviewOnTabSwitch\(tabId\)/);
  assert.match(source,/syncAppTabRoute\(tabId\)/);
  assert.doesNotMatch(unit,/localStorage\.setItem/);
  assert.doesNotMatch(unit,/saveOrder|deliverOrder|saveAndFetch/);
});
