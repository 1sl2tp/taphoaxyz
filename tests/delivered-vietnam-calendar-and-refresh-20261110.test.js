import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const bridge=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/fixed-ui-runtime-7.js',import.meta.url),'utf8');
const overrides=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

const viStart=bridge.indexOf('function viTime(value){');
const viEnd=bridge.indexOf('\nfunction currentUid()',viStart);
const timeStart=bridge.indexOf('function orderStatus(order){');
const timeEnd=bridge.indexOf('\nfunction backendOrderId(',timeStart);
assert.ok(viStart>0&&viEnd>viStart&&timeStart>0&&timeEnd>timeStart,'canonical timestamp projection functions');

const projectionCode=`
 const text=value=>String(value??'');
 const first=(obj,keys,fallback='')=>{
  for(const key of keys)if(obj&&obj[key]!==undefined&&obj[key]!==null&&obj[key]!=='')return obj[key];
  return fallback;
 };
 ${bridge.slice(viStart,viEnd)}
 ${bridge.slice(timeStart,timeEnd)}
 const orders=[
  ['DG304','2026-11-09T04:39:55.618641+00:00'],
  ['DG305','2026-11-09T04:40:05.503015+00:00'],
  ['DG306','2026-11-09T04:54:38.710556+00:00'],
  ['DG307','2026-11-09T05:09:42.807869+00:00'],
  ['DG308','2026-11-09T05:21:47.284004+00:00'],
  ['DG309','2026-11-09T07:00:40.303195+00:00']
 ];
 const dates=orders.map(([code,delivered_at])=>({code,date:orderTime({
   status:'done',delivered_at,ngay:'2026-11-08T04:00:00+00:00',
   created_at:'2026-11-08T02:00:00+00:00'
 })}));
 const pending=orderTime({status:'pending',ngay:'2026-11-09T23:40:00+07:00',
   delivered_at:'2026-11-08T04:00:00+00:00'});
 const midnight=viTime('2026-11-09T17:00:00+00:00');
 const leap=viTime('2024-02-29T17:15:00+00:00');
 console.log(JSON.stringify({dates,pending,midnight,leap}));
`;

test('six real 09/11 DG delivery timestamps stay 09/11 on Web, PWA, APK across host timezones',()=>{
 for(const tz of ['Asia/Ho_Chi_Minh','Etc/UTC','America/Los_Angeles','Pacific/Honolulu','Asia/Tokyo']){
  const result=spawnSync(process.execPath,['-e',projectionCode],{
    env:{...process.env,TZ:tz},encoding:'utf8'
  });
  assert.equal(result.status,0,tf(tz,result.stderr));
  const data=JSON.parse(result.stdout.trim());
  assert.deepEqual(data.dates.map(x=>x.code),['DG304','DG305','DG306','DG307','DG308','DG309']);
  assert.ok(data.dates.every(x=>x.date.startsWith('09/11/2026 ')),`${tz} projected wrong calendar: ${JSON.stringify(data.dates)}`);
  assert.equal(data.dates.at(-1).date,'09/11/2026 14:00:40');
  assert.equal(data.pending,'09/11/2026 23:40:00');
  assert.equal(data.midnight,'10/11/2026 00:00:00');
  assert.equal(data.leap,'01/03/2024 00:15:00');
 }
});
function tf(tz,error){return `Zone ${tz}: ${error}`;}

test('Đã giao yesterday filter uses 09/11 in Vietnam and matches all six projections',()=>{
 const start=ui.indexOf("const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';");
 const end=ui.indexOf('\n        function getRowsVisibleForOrderTab(',start);
 assert.ok(start>0&&end>start,'canonical date filter and parser');
 class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:['2026-11-09T22:00:00Z']));}
  static now(){return Date.parse('2026-11-09T22:00:00Z');}
 }
 const ctx=vm.createContext({Intl,Date:FixedDate,currentAuthRole:'admin'});
 vm.runInContext(ui.slice(start,end)+
   "\norderTimeFilters.dongiao.mode='yesterday';globalThis.api={getOrderTimeRange,orderRowMatchesTimeFilter,parseOrderDateKey};",ctx);
 const range=ctx.api.getOrderTimeRange('dongiao');
 assert.equal(range.from,'2026-11-09');
 assert.equal(range.to,'2026-11-09');
 const fixture=['11:39:55','11:40:05','11:54:38','12:09:42','12:21:47','14:00:40'];
 for(const time of fixture)assert.equal(ctx.api.orderRowMatchesTimeFilter([,,,,,,'09/11/2026 '+time],'dongiao'),true);
 assert.equal(ctx.api.orderRowMatchesTimeFilter([,,,,,,'08/11/2026 23:59:59'],'dongiao'),false);
 assert.equal(ctx.api.orderRowMatchesTimeFilter([,,,,,,'10/11/2026 00:00:00'],'dongiao'),false);
});

const start=overrides.indexOf('// SPEC-DEBT-FILTER-AUTHORITATIVE-20261104: switching into the debt tab');
const end=overrides.indexOf('  async function refreshOrderUiAfterMutation()',start);
assert.ok(start>0&&end>start,'existing tab refresh owner');
const tabCode=overrides.slice(start,end);
const deferred=()=>{let resolve;const promise=new Promise(ok=>{resolve=ok;});return{promise,resolve};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function tabs(mode='account'){
 let active='tab-ban-hang',owner={uid:'admin'},access=mode,refreshes=[];
 const gate=deferred(),projections=[];
 const prod={getIdentity:()=>owner,getAccessMode:()=>access,refresh:async names=>{
   refreshes.push([...names]);return gate.promise;
 }};
 const ctx=vm.createContext({
  console:{warn(){}},backend:()=>prod,
  document:{querySelector:()=>({id:active})},
  refreshFixedSheets:async sheets=>{projections.push([...sheets])},
  switchTab(id){active=id;return id}
 });
 vm.runInContext(tabCode,ctx);
 return {ctx,gate,refreshes,projections,setOwner(){owner={uid:'other'};},get active(){return active}};
}
test('delivered tab fetches orders once on explicit entry without polling on filter or repeat click',async()=>{
 const t=tabs();
 t.ctx.switchTab('tab-da-giao');t.ctx.switchTab('tab-da-giao');
 assert.equal(JSON.stringify(t.refreshes),JSON.stringify([['orders']]));
 t.gate.resolve({});await tick();
 assert.equal(JSON.stringify(t.projections),JSON.stringify([['dongiao']]));
});
test('stale delivered-tab response after navigating away or changing account cannot redraw',async()=>{
 for(const reason of ['navigate','account']){
  const t=tabs();t.ctx.switchTab('tab-da-giao');
  if(reason==='navigate')t.ctx.switchTab('tab-ban-hang');else t.setOwner();
  t.gate.resolve({});await tick();
  assert.equal(t.projections.length,0,reason);
 }
});
test('public and employee links never run administrator delivered refresh',()=>{
 for(const mode of ['public-link','employee-link']){
  const t=tabs(mode);t.ctx.switchTab('tab-da-giao');
  assert.equal(t.refreshes.length,0);
 }
});
