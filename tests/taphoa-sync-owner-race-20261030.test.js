import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*?;\s*$/gm,'');
assert(!source.includes("import {createAuthService}"),'bridge imports must be isolated in VM only');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,release:resolve};}
async function tick(){for(let i=0;i<24;i++)await Promise.resolve();}
function fixture(){
 const writes=[],events=[],metaCalls=[],domainCalls=[],channels=[],stalled={};
 let state={version:'init',revisions:{orders:0},permissions:{}};
 let runtime=null;
 const snapshot={
  load(){return null;},
  save(uid,data){writes.push({kind:'snapshot',uid,dataUid:data.uid||data.user?.id});return true;},
  clear(uid){writes.push({kind:'clear',uid});}
 };
 const appState={
  get(){return state;},
  setBootstrap(data){state={...data};writes.push({kind:'bootstrap',uid:data.uid});},
  mergeDomains(data){state={...state,...data};writes.push({kind:'domain',uid:state.uid,version:data.version});},
  reset(){state={version:'reset',revisions:{orders:0},permissions:{}};writes.push({kind:'reset'});}
 };
 const getId=()=>runtime?.getIdentity?.()?.uid||'none';
 async function guarded(type,account){
  const key=type+':'+account;
  if(stalled[key])await stalled[key].promise;
 }
 const business={
  async bootstrap(){const account=getId();await guarded('bootstrap',account);return{uid:account,version:'bootstrap-'+account,revisions:{orders:0},permissions:{}};},
  async meta(){const account=getId();metaCalls.push(account);await guarded('meta',account);return{version:'meta-'+account,revisions:{orders:1},permissions:{}};},
  async domains(){const account=getId();domainCalls.push(account);await guarded('domains',account);return{version:'domains-'+account,revisions:{orders:1}};}
 };
 const auth={
  async login(username){await guarded('login',username);return{identity:{uid:username,role:'admin'},session:{user:{id:username}}};},
  async restore(){return null;},
  async logout(){await guarded('logout',getId());},
  async getClient(){
   const account=getId();
   await guarded('client',account);
   return {
    channel(name){
     const ch={account,name,on(type,config,listener){ch.listener=listener;return ch;},subscribe(listener){ch.status=listener;return ch;}};channels.push(ch);return ch;
    },
    removeChannel(){return Promise.resolve();}
   };
  }
 };
 const win={addEventListener(){},dispatchEvent(event){events.push(event);}};
 const document={hidden:false,addEventListener(){}};
 const ctx={
  console,window:win,document,navigator:{onLine:true},
  createAuthService:()=>auth,createApi:()=>business,createAppState:()=>appState,
  changedDomains:(before,after)=>Number(before?.orders||0)===Number(after?.orders||0)?[]:['orders'],
  createSnapshotStore:()=>snapshot,CONFIG:{supabaseUrl:'https://example.invalid'},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  setTimeout(){return 123;},clearTimeout(){},fetch(){throw Error('unexpected network fetch')},
  String,Number,Boolean,Object,Array,Map,Set,Date,JSON,Math,Promise
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:1500});
 runtime=win.TAPHOA_PRODUCTION;
 async function login(name){const result=await runtime.login(name,'pw');await tick();return result;}
 function hold(type,account){const g=deferred();stalled[type+':'+account]=g;return g;}
 function unhold(type,account){const k=type+':'+account;stalled[k]?.release();delete stalled[k];}
 return{runtime,login,hold,unhold,writes,events,metaCalls,domainCalls,channels,appState,auth};
}
test('late A meta after B login cannot merge B, repaint B or write B snapshot',async()=>{
 const f=fixture();await f.login('A');
 const gate=f.hold('meta','A'),pending=f.runtime.syncOnce();
 await tick();await f.runtime.logout();await f.login('B');
 const before=f.writes.length;
 gate.release();await pending;
 assert.equal(f.writes.length,before);
 assert.equal(f.runtime.getState().uid,'B');
 assert.equal(f.events.filter(e=>e.type==='taphoa-production-sync').length,0);
 await f.runtime.syncOnce();
 assert.equal(f.runtime.getState().version,'domains-B');
 assert(f.writes.filter(w=>w.kind==='snapshot').every(w=>w.uid==='B'));
});
test('old A finally never clears B in-flight RPC (one trigger one job)',async()=>{
 const f=fixture();await f.login('A');
 const a=f.hold('meta','A'),pA=f.runtime.syncOnce();await tick();
 await f.runtime.logout();await f.login('B');
 const b=f.hold('meta','B'),pB=f.runtime.syncOnce();await tick();
 assert.deepEqual(f.metaCalls,['A','B']);
 a.release();await pA;
 void f.runtime.syncOnce();await tick();
 assert.deepEqual(f.metaCalls,['A','B'],'one B meta RPC while B is pending');
 b.release();await pB;
 assert.equal(f.runtime.getState().version,'domains-B');
});
test('old A domain refresh cannot write B state after awaited RPC',async()=>{
 const f=fixture();await f.login('A');
 const g=f.hold('domains','A'),pA=f.runtime.syncOnce();await tick();
 assert.deepEqual(f.domainCalls,['A']);
 await f.runtime.logout();await f.login('B');
 const before=f.writes.length;g.release();await pA;
 assert.equal(f.writes.length,before);
 assert.equal(f.events.length,0);
 assert.equal(f.runtime.getState().uid,'B');
});
test('same-account fresh login invalidates previous in-flight meta',async()=>{
 const f=fixture();await f.login('A');
 const gate=f.hold('meta','A'),old=f.runtime.syncOnce();await tick();
 await f.login('A');const before=f.writes.length;
 gate.release();await old;
 assert.equal(f.writes.length,before,'same user + new session must not merge old response');
});
test('obsolete A bootstrap cannot override B session',async()=>{
 const f=fixture();
 const g=f.hold('bootstrap','A'),pending=f.runtime.login('A','pw');await tick();
 const next=await f.login('B');assert.equal(next.identity.uid,'B');
 const before=f.writes.length;g.release();await pending;
 assert.equal(f.writes.length,before);
 assert.equal(f.runtime.getIdentity().uid,'B');
});
test('A realtime subscription cannot register after delayed getClient on B switch',async()=>{
 const f=fixture();
 const g=f.hold('client','A'),pending=f.runtime.login('A','pw');await tick();
 await f.login('B');const before=f.channels.length;
 g.release();await pending;
 assert.equal(f.channels.length,before);
 assert.equal(f.channels.at(-1).account,'B');
});
test('old logout completion does not reset newly logged-in B UI',async()=>{
 const f=fixture();await f.login('A');
 const g=f.hold('logout','A'),old=f.runtime.logout();await tick();
 await f.login('B');
 const before=f.writes.length;g.release();await old;
 assert.deepEqual(f.writes.slice(before).map(w=>({kind:w.kind,uid:w.uid})),[{kind:'clear',uid:'A'}],
   'finishing old logout may clear only A snapshot, never reset B');
 assert.equal(f.runtime.getIdentity().uid,'B');
});
test('queued A login response cannot replace B when credentials request overlaps',async()=>{
 const f=fixture();
 const g=f.hold('login','A'),old=f.runtime.login('A','pw');await tick();
 await f.login('B');
 g.release();await old;
 assert.equal(f.runtime.getIdentity().uid,'B');
});
