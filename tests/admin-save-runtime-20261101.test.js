import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=admin.indexOf('    function queueSave(row){');
const end=admin.indexOf('\n\n    function updatePager(){',start);
assert.ok(start>=0&&end>start);
const queueSource=admin.slice(start,end);

function fixture(rpcImpl){
  const state={
    items:[
      {product_code:'p1',product_name:'Original',cost:null,legacy_profit_vnd:2,price:null,source_key:'hang-thuong'},
      {product_code:'p2',product_name:'Other',cost:null,legacy_profit_vnd:5,price:null,source_key:'hang-thuong'}
    ],
    status:{textContent:'',title:''},calls:[],
    rpcImpl:async(name,args)=>{
      if(name!=='taphoa_update_product_from_web')throw Error('Unexpected RPC '+name);
      state.calls.push({...args.p_product});
      return rpcImpl?rpcImpl(args.p_product):{};
    }
  };
  const ctx=vm.createContext({state,console,Promise,Map,Date});
  vm.runInContext(`
    let items=state.items;
    let catalogSessionGeneration=0,identity={uid:'admin-1'};
    const saveQueues=new Map();
    const $=id=>id==='statusText'?state.status:null;
    const rpc=(name,args)=>state.rpcImpl(name,args);
    const rowPayload=row=>({...row.payload});
    const selectedSalePrice=(_cost,_supplier,_basis,_source,profit)=>100+Number(profit||0);
    const same=(a,b)=>String(a??'')===String(b??'');
    const markRow=(row,status)=>{row.lastState=status;};
    const updateDerived=(row,item)=>{row.renderedCode=item.product_code;};
    const loadSupplierFeedback=async()=>{};
    ${queueSource}
    globalThis.api={queueSave,saveQueues,changeSession:()=>{catalogSessionGeneration++;identity={uid:'admin-2'};saveQueues.clear();}};
  `,ctx);
  const row=(code,name,legacyProfit)=>({
    dataset:{code,dirty:'1'},isConnected:true,lastState:'',
    payload:{product_code:code,name,cost:null,supplier_price:null,legacy_profit:legacyProfit,
      standard_profit_percent:null,units_per_carton:10,retail_unit:'gói',
      retail_price_override:null,admin_state:'active',sale_price_mode:'manual',sale_price_basis:'reference'},
    querySelector:()=>({className:''})
  });
  return {state,api:ctx.api,row};
}

test('async price write stays tied to product code and snapshots values before queued work',async()=>{
  const f=fixture();
  const row=f.row('p1','Đã sửa',7);
  const task=f.api.queueSave(row);
  row.payload.name='Tên nhập sau';
  f.state.items.reverse();
  assert.equal(await task,true);
  assert.equal(f.state.calls[0].name,'Đã sửa');
  assert.equal(f.state.items.find(x=>x.product_code==='p1').product_name,'Đã sửa');
  assert.equal(f.state.items.find(x=>x.product_code==='p2').product_name,'Other');
  assert.equal(row.dataset.dirty,'0');
  assert.equal(row.renderedCode,'p1');
});

test('reference price fallback uses new submitted profit when backend omits price',async()=>{
  const f=fixture();
  const row=f.row('p1','Profit change',17);
  assert.equal(await f.api.queueSave(row),true);
  const item=f.state.items.find(x=>x.product_code==='p1');
  assert.equal(item.legacy_profit_vnd,17);
  assert.equal(item.price,117);
});

test('failed price write preserves dirty row and provides an actionable error',async()=>{
  const f=fixture(async()=>{throw Error('Không ghi được máy chủ');});
  const row=f.row('p1','Draft',10);
  assert.equal(await f.api.queueSave(row),false);
  assert.equal(row.dataset.dirty,'1');
  assert.equal(row.lastState,'error');
  assert.match(f.state.status.textContent,/Không ghi được máy chủ/);
  assert.equal(f.state.status.title,'Không ghi được máy chủ');
});

test('save generations do not turn an older completion into a saved indicator',async()=>{
  let release;
  const first=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const f=fixture(async()=>{calls++;if(calls===1)await first;return {};});
  const row=f.row('p1','First',10);
  const p1=f.api.queueSave(row);
  row.dataset.dirty='1';row.payload.name='Second';
  const p2=f.api.queueSave(row);
  release();
  assert.equal(await p1,true);
  assert.equal(await p2,true);
  assert.equal(row.renderedCode,'p1');
  assert.equal(f.state.items.find(x=>x.product_code==='p1').product_name,'Second');
});

test('queued save from an expired login never writes through the next account',async()=>{
  let unblock;
  const inFlight=new Promise(resolve=>{unblock=resolve;});
  let firstStarted;
  const firstStart=new Promise(resolve=>{firstStarted=resolve;});
  const f=fixture(async p=>{
    if(p.name==='Block'){firstStarted();await inFlight;}
    return {};
  });
  const row=f.row('p1','Block',7);
  const first=f.api.queueSave(row);
  await firstStart;
  row.dataset.dirty='1';row.payload.name='Old pending';
  const second=f.api.queueSave(row);
  f.api.changeSession();
  unblock();
  assert.equal(await first,false,'old response must be ignored');
  assert.equal(await second,false,'queued old write must not run with new credentials');
  assert.equal(f.state.calls.length,1);
  assert.equal(f.state.items[0].product_name,'Original');
});

test('a completed old-session response never mutates newly opened admin data',async()=>{
  let resume,started;
  const pending=new Promise(resolve=>{resume=resolve;});
  const began=new Promise(resolve=>{started=resolve;});
  const f=fixture(async()=>{started();await pending;return {price:1234};});
  const row=f.row('p1','Old response',4);
  const task=f.api.queueSave(row);
  await began;
  f.api.changeSession();
  resume();
  assert.equal(await task,false);
  assert.equal(f.state.items[0].product_name,'Original');
  assert.equal(f.state.items[0].price,null);
});
