import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const override=read('src/fixed-production-overrides.js');
const ledger=read('src/fixed-ui-behavior.js');
const css=read('src/fixed-ui-debt-popup.css');
const runtime=read('src/fixed-ui-runtime-11.js');
const index=read('index.html');
const start=override.indexOf('// SPEC-DEBT-FILTER-AUTHORITATIVE-20261104: switching into the debt tab');
const end=override.indexOf('  async function refreshOrderUiAfterMutation()',start);
assert(start>0&&end>start,'one canonical on-entry debt refresh owner');

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject}};
const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function setup(mode='account'){
 let currentMode=mode,identity={uid:'A'},active='tab-ban-hang',reads=0;
 let gate=deferred();
 const applied=[],warnings=[],seenTabs=[];
 const prod={
  getIdentity:()=>identity,getAccessMode:()=>currentMode,
  refresh(names){reads++;return gate.promise;}
 };
 const ctx={
  console:{warn:(...args)=>warnings.push(args)},
  document:{querySelector:()=>({id:active})},
  backend:()=>prod,
  refreshFixedSheets:async names=>{applied.push([...names])},
  switchTab(id){active=id;seenTabs.push(id);return id},
 };
 vm.createContext(ctx);vm.runInContext(override.slice(start,end),ctx);
 return {ctx,prod,gate,applied,warnings,seenTabs,
  get reads(){return reads}, get active(){return active},
  switchAccount(){identity={uid:'B'}},
  setMode(value){currentMode=value},
  setGate(value){gate=value}
 };
}
test('entering debt tab fetches current server debt exactly once then repaints summary',async()=>{
 const t=setup();t.ctx.switchTab('tab-cong-no',null);
 assert.equal(t.reads,1);
 t.ctx.switchTab('tab-cong-no',null);
 assert.equal(t.reads,1,'reopening active tab does not poll or duplicate reads');
 t.gate.resolve({});await tick();
 assert.equal(JSON.stringify(t.applied),JSON.stringify([['thuchi']]));
});
test('stale debt response after leaving tab cannot replace another tab',async()=>{
 const t=setup();t.ctx.switchTab('tab-cong-no',null);
 t.ctx.switchTab('tab-ban-hang',null);
 t.gate.resolve({});await tick();
 assert.equal(t.applied.length,0);
});
test('a session rotation invalidates an old debt summary read',async()=>{
 const t=setup();t.ctx.switchTab('tab-cong-no',null);
 t.switchAccount();t.gate.resolve({});await tick();
 assert.equal(t.applied.length,0);
});
test('public/employee sessions have no extra refresh; main tab remains interactive',async()=>{
 for(const mode of ['public-link','employee-link']){
  const t=setup(mode);
  assert.equal(t.ctx.switchTab('tab-cong-no',null),'tab-cong-no');
  assert.equal(t.reads,0);
  assert.equal(t.warnings.length,0);
 }
});
test('the amount owner retains exact signed movement while ledger card becomes two lines',()=>{
 assert.match(runtime,/officialSummary\s*=\s*window\.TAPHOA_PRODUCTION\?\.getState\?\.\(\)\?\.debtSummary/);
 assert.match(runtime,/customerDebts\[customerId\]\.debt\s*=\s*balance/);
 assert.match(ledger,/debt-ledger-row py-2\.5 px-2/);
 assert.match(ledger,/debt-ledger-info/);
 assert.match(ledger,/debt-ledger-side text-right/);
 assert.match(ledger,/debt-ledger-meta text-\[10px\]/);
 assert.match(ledger,/Sổ #\$\{ledgerId\} · /);
 assert.match(ledger,/Ghi sổ: \$\{escapeProductEditorValue\(h\.time\)\}/);
 assert.match(ledger,/runningBalanceText/);
 assert.match(ledger,/sign\}\$\{amountLabel\}/);
 assert.match(css,/#customerDebtBottomSheet #cDebtModalHistoryList \.debt-ledger-row\{/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/#customerDebtBottomSheet #cDebtModalHistoryList \.debt-ledger-side\{[\s\S]*?justify-content:center/);
 assert.match(index,/fixed-ui-behavior\.js[^\n]*debt-ledger-two-line=20261104/);
 assert.match(index,/fixed-ui-debt-popup\.css[^\n]*debt-ledger-two-line=20261104/);
 assert.match(index,/fixed-production-overrides\.js[^\n]*debt-filter-canonical=20261104/);
 assert.match(index,/fixed-ui-runtime-11\.js[^\n]*debt-filter-canonical=20261104/);
});
