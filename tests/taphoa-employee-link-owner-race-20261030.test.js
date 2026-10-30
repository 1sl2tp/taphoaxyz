import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*?;\s*$/gm,'');

function deferred(){
  let release;
  const promise=new Promise(resolve=>{release=resolve;});
  return {promise,release};
}
async function tick(){for(let i=0;i<12;i++)await Promise.resolve();}

function fixture(){
  const gates=new Map(),requests=[];
  let state={user:null,products:[],revisions:{},permissions:{}};
  const appState={
    get(){return state;},
    setBootstrap(data){state=data;},
    mergeDomains(data){state={...state,...data};},
    reset(){state={user:null,products:[],revisions:{},permissions:{}};}
  };
  const auth={getClient:async()=>({}),logout:async()=>{}};
  const fetch=(url,options={})=>{
    const method=options.method||'GET';
    const token=method==='GET'
      ?new URL(url).searchParams.get('t')
      :JSON.parse(options.body).token;
    requests.push({method,token,pin:options.headers?.['x-employee-pin']});
    const response={ok:true,json:async()=>({
      ok:true,role:'employee',customer_id:token,
      customer_name:'Employee '+token,products:[]
    })};
    const gate=gates.get(method+':'+token);
    return gate?gate.promise.then(()=>response):Promise.resolve(response);
  };
  const win={addEventListener(){},dispatchEvent(){}};
  const ctx={
    window:win,document:{hidden:false,addEventListener(){}},
    navigator:{onLine:true},console,URL,Date,String,Number,Boolean,Object,Array,
    Map,Set,Promise,JSON,Math,fetch,
    createAuthService:()=>auth,createApi:()=>({}),createAppState:()=>appState,
    changedDomains:()=>[],createSnapshotStore:()=>({load:()=>null,save(){},clear(){}}),
    CONFIG:{supabaseUrl:'https://example.invalid'},
    CustomEvent:class CustomEvent{constructor(type){this.type=type;}},
    setTimeout:()=>1,clearTimeout(){}
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{timeout:2500});
  const runtime=win.TAPHOA_PRODUCTION;
  function hold(method,token){
    const g=deferred();
    gates.set(method+':'+token,g);
    return {release(){gates.delete(method+':'+token);g.release();}};
  }
  return {runtime,hold,requests};
}

test('late old employee snapshot cannot enter the new employee session',async()=>{
  const f=fixture();
  await f.runtime.openEmployeeLink('A','1111');
  const held=f.hold('GET','A');
  const old=f.runtime.getEmployeeSnapshot();
  await tick();
  await f.runtime.openEmployeeLink('B','2222');
  held.release();
  await assert.rejects(old,/employee_access_changed/);
  assert.equal(f.runtime.getIdentity().uid,'B');
  assert.equal((await f.runtime.getEmployeeSnapshot()).customer_id,'B');
  await f.runtime.bootstrap({force:true});
  assert.equal(f.runtime.getState().user.id,'B');
  assert.deepEqual(f.requests.map(r=>r.pin),['1111','1111','2222','2222']);
});

test('switching employee link clears old customer state while new PIN is checked',async()=>{
  const f=fixture();
  await f.runtime.openEmployeeLink('A','1111');
  assert.equal(f.runtime.getState().user.id,'A');
  const held=f.hold('GET','B');
  const pending=f.runtime.openEmployeeLink('B','2222');
  await tick();
  assert.equal(f.runtime.getIdentity(),null);
  assert.equal(f.runtime.getState().user,null);
  assert.deepEqual(f.runtime.getState().products,[]);
  held.release();
  await pending;
  assert.equal(f.runtime.getState().user.id,'B');
});

test('late old employee write acknowledgment is not accepted by a new link',async()=>{
  const f=fixture();
  await f.runtime.openEmployeeLink('A','1111');
  const held=f.hold('POST','A');
  const old=f.runtime.saveEmployeeQuantities([{product_code:'P1',qty:2}]);
  await tick();
  await f.runtime.openEmployeeLink('B','2222');
  held.release();
  await assert.rejects(old,/employee_access_changed/);
  const sent=f.requests.find(r=>r.method==='POST');
  assert.deepEqual(sent,{method:'POST',token:'A',pin:'1111'});
  assert.equal(f.runtime.getIdentity().uid,'B');
});

test('re-entering same employee link invalidates the previous fetch generation',async()=>{
  const f=fixture();
  await f.runtime.openEmployeeLink('A','1111');
  const held=f.hold('GET','A');
  const old=f.runtime.getEmployeeSnapshot();
  await tick();
  // Release a fresh link initialization independently of the stale GET.
  held.release();
  await f.runtime.openEmployeeLink('A','1111');
  await assert.rejects(old,/employee_access_changed/);
});