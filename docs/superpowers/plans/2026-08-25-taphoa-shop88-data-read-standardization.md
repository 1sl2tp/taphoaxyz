# TAPHOA SHOP88-Style Data Read Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuẩn hóa đường đọc dữ liệu TAPHOA theo cùng nguyên tắc ổn định của SHOP88: bootstrap một lần, theo dõi revision, chỉ refresh domain thay đổi, giữ snapshot theo tài khoản, và cập nhật đúng Active Screen mà không reload toàn app.

**Architecture:** Giữ nguyên chuỗi `UI → Screen Controller → Business Service → Supabase RPC gateway`. `app.js` tiếp tục là owner của lifecycle session/data; `app-state.js` là runtime source of truth và phát subscription events; `snapshot.js` cô lập cache; Business Service bổ sung `app_meta`; 4 Screen chỉ đọc App State và subscribe khi đang mount. Không đổi backend contract, schema, RPC, RLS, Auth hay nghiệp vụ tài chính.

**Tech Stack:** Static ES modules, Supabase JS `2.112.3`, browser `localStorage`, Node.js built-in test runner (`node --test`) cho unit tests không phụ thuộc browser.

**Spec:** `docs/specs/2026-08-25-taphoa-shop88-data-read-standardization-design.md`

## Global Constraints

- Giữ kiến trúc TAPHOA: `UI → Screen Controller → Business Service → Supabase RPC gateway`.
- Không cho từng Screen tự đọc Supabase trực tiếp.
- App State là nguồn dữ liệu runtime duy nhất cho 4 Screen nghiệp vụ.
- Server revision quyết định khi nào phải tải lại một domain.
- Cache chỉ dùng để mở nhanh/khôi phục; không được ghi đè dữ liệu mới hơn từ server.
- Không thay schema, RPC, RLS, Auth hay nghiệp vụ tài chính.
- Không port UI SHOP88 sang TAPHOA.
- Không deploy production trong mốc này.
- Contract giá giữ nguyên: `p.gia = products.price`, `p.von = products.cost`, `p.giaLe = price / pack_qty` từ backend; không nhân/chia 1000 ở frontend.
- Gate dữ liệu: 649 sản phẩm, 5 nguồn, 38 khách, `tl1 = Cứng / gia 125 / von 124`.

---

## File Structure

- Create `package.json` — khai báo ESM và lệnh `npm test` bằng Node built-in test runner; không thêm dependency.
- Create `src/core/snapshot.js` — duy nhất sở hữu key/version/load/save/clear snapshot TAPHOA.
- Modify `src/core/business.js` — thêm `meta()` gọi `app_meta`; giữ nguyên các RPC ghi hiện có.
- Modify `src/core/app-state.js` — giữ đầy đủ bootstrap fields, merge domain theo response, subscription, revision comparison helper.
- Modify `src/app.js` — lifecycle cache/bootstrap/meta sync, timer, online/visibility hooks, stop sync khi logout, truyền `subscribeData` cho Active Screen.
- Modify `src/screens/sales.js` — subscribe products/customers mà không làm mất cart/price edits đang thao tác.
- Modify `src/screens/delivered.js` — subscribe orders và render lại dữ liệu hiện hành.
- Modify `src/screens/pending.js` — subscribe orders và render lại dữ liệu hiện hành.
- Modify `src/screens/debt.js` — subscribe debt/customers/orders cần thiết và giữ trạng thái drill-down hiện tại.
- Create `tests/app-state.test.js` — bootstrap/merge/revision/subscription regression tests.
- Create `tests/snapshot.test.js` — uid/cache-version isolation tests.
- Create `tests/business.test.js` — xác nhận mapping RPC `app_bootstrap/app_meta/app_domains`.

---

### Task 1: Add zero-dependency ESM test harness and lock the data contract

**Files:**
- Create: `package.json`
- Create: `tests/app-state.test.js`
- Modify: `src/core/app-state.js`

**Interfaces:**
- Consumes: existing `createAppState()`.
- Produces: `createAppState()` with `subscribe(listener)` and exported `changedDomains(localRevisions, remoteRevisions)`.
- Listener contract: `listener({state, changed})`, where `changed` is an array of logical domains such as `['products']`.

- [ ] **Step 1: Create the Node ESM test harness**

Create `package.json` exactly with:

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

No dependencies are added; browser behavior remains static-module based.

- [ ] **Step 2: Write failing App State contract tests**

Create `tests/app-state.test.js` with tests covering all required state behavior:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppState,changedDomains} from '../src/core/app-state.js';

const bootstrap={
  version:'SUPABASE-1',syncSeconds:30,
  user:{id:'u1'},permissions:{canSeeCost:true},
  products:[{id:'tl1',ten:'Cứng',gia:125,von:124,nhom:'Thuốc lá'}],
  sources:[{id:'src1',name:'Thuốc lá'}],
  customers:[{id:'kh1',ten:'Khách 1'}],
  orders:[{id:'o1'}],debtSummary:[{maKH:'kh1',soDu:0}],
  printSettings:{shopName:'TAPHOA'},selfCustomer:null,
  revisions:{products:2,customers:1,orders:1,debt:1,settings:1}
};

test('setBootstrap preserves the complete server bundle',()=>{
  const app=createAppState();
  app.setBootstrap(bootstrap);
  const s=app.get();
  assert.equal(s.version,'SUPABASE-1');
  assert.equal(s.syncSeconds,30);
  assert.equal(s.products.length,1);
  assert.equal(s.products[0].ten,'Cứng');
  assert.equal(s.products[0].gia,125);
  assert.equal(s.products[0].von,124);
  assert.equal(s.sources.length,1);
  assert.equal(s.customers.length,1);
  assert.equal(s.orders.length,1);
  assert.equal(s.debtSummary.length,1);
  assert.deepEqual(s.printSettings,{shopName:'TAPHOA'});
  assert.deepEqual(s.revisions,bootstrap.revisions);
});

test('mergeDomains changes only keys present in the domain bundle',()=>{
  const app=createAppState();
  app.setBootstrap(bootstrap);
  app.mergeDomains({products:[{id:'tl1',ten:'Cứng mới',gia:126}],sources:[{id:'src1',name:'Thuốc lá'}],revisions:{products:3}});
  const s=app.get();
  assert.equal(s.products[0].gia,126);
  assert.equal(s.customers[0].ten,'Khách 1');
  assert.equal(s.orders[0].id,'o1');
  assert.equal(s.debtSummary[0].maKH,'kh1');
  assert.equal(s.revisions.products,3);
  assert.equal(s.revisions.customers,1);
});

test('changedDomains returns only server revisions that differ',()=>{
  assert.deepEqual(
    changedDomains(
      {products:2,customers:1,orders:4,debt:3,settings:1},
      {products:3,customers:1,orders:4,debt:5,settings:1}
    ),
    ['products','debt']
  );
});

test('subscribers receive changed domains and can unsubscribe',()=>{
  const app=createAppState();
  const calls=[];
  const unsubscribe=app.subscribe(event=>calls.push(event.changed));
  app.setBootstrap(bootstrap);
  app.mergeDomains({customers:[{id:'kh2',ten:'Khách 2'}],revisions:{customers:2}});
  unsubscribe();
  app.mergeDomains({orders:[],revisions:{orders:2}});
  assert.deepEqual(calls,[['bootstrap'],['customers']]);
});
```

- [ ] **Step 3: Run the tests and verify they fail before implementation**

Run:

```bash
npm test
```

Expected: FAIL because `changedDomains` and/or `subscribe` do not yet exist and current state does not preserve every server field.

- [ ] **Step 4: Implement the minimal App State changes**

Update `src/core/app-state.js` so the initial state includes at least:

```js
const initial=()=>({
  user:null,permissions:{},products:[],sources:[],customers:[],orders:[],debtSummary:[],
  printSettings:{},selfCustomer:null,revisions:{},version:'',syncSeconds:30,editOrder:null
});
```

Export revision comparison:

```js
const REVISION_DOMAINS=['products','customers','orders','debt','settings'];

export function changedDomains(localRevisions={},remoteRevisions={}){
  return REVISION_DOMAINS.filter(domain=>Number(remoteRevisions?.[domain]||0)!==Number(localRevisions?.[domain]||0));
}
```

Add subscriber storage inside `createAppState()` and notify only after successful state mutation:

```js
const listeners=new Set();
const emit=changed=>{
  const event={state,changed};
  for(const listener of listeners) listener(event);
};
```

`setBootstrap(data)` must preserve `version`, `syncSeconds`, `selfCustomer` and current `editOrder`, then `emit(['bootstrap'])`.

`mergeDomains(data)` must infer changed logical domains from response keys:
- `products` or `sources` => `products`
- `customers` or `selfCustomer` => `customers`
- `orders` => `orders`
- `debtSummary` => `debt`
- `printSettings` => `settings`

Expose:

```js
subscribe(listener){
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}
```

`reset()` clears runtime state and emits `['reset']`.

- [ ] **Step 5: Run App State tests**

Run:

```bash
npm test -- tests/app-state.test.js
```

Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json src/core/app-state.js tests/app-state.test.js
git commit -m "test: lock TAPHOA data state contract"
```

---

### Task 2: Add SHOP88-style meta/domain read API and verify RPC routing

**Files:**
- Modify: `src/core/business.js`
- Create: `tests/business.test.js`

**Interfaces:**
- Consumes: `gateway.rpc(name,args)` from `src/core/supabase.js`.
- Produces:
  - `business.bootstrap(): Promise<object>` → `app_bootstrap`
  - `business.meta(): Promise<object>` → `app_meta`
  - `business.domains(domains: string[]): Promise<object>` → `app_domains({p_domains:[...]})`

- [ ] **Step 1: Write failing Business Service read-path tests**

Create `tests/business.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessService} from '../src/core/business.js';

function fakeService(){
  const calls=[];
  const gateway={rpc:async(name,args)=>{calls.push([name,args]);return {name,args};}};
  return {service:createBusinessService({gateway,idFactory:()=>"cmd-1"}),calls};
}

test('bootstrap routes to app_bootstrap',async()=>{
  const {service,calls}=fakeService();
  await service.bootstrap();
  assert.deepEqual(calls,[['app_bootstrap',{}]]);
});

test('meta routes to app_meta',async()=>{
  const {service,calls}=fakeService();
  await service.meta();
  assert.deepEqual(calls,[['app_meta',{}]]);
});

test('domains deduplicates names and routes to app_domains',async()=>{
  const {service,calls}=fakeService();
  await service.domains(['products','products','debt']);
  assert.deepEqual(calls,[['app_domains',{p_domains:['products','debt']}]]);
});
```

- [ ] **Step 2: Run the Business Service tests and verify the new meta test fails**

Run:

```bash
npm test -- tests/business.test.js
```

Expected: bootstrap/domains existing tests pass; meta test FAIL because `service.meta` does not exist.

- [ ] **Step 3: Add the minimal `meta()` method**

In `createBusinessService()` return object, add exactly:

```js
meta:()=>gateway.rpc('app_meta',{}),
```

Do not change existing mutation methods or payload mapping.

- [ ] **Step 4: Run Business Service tests**

Run:

```bash
npm test -- tests/business.test.js
```

Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/core/business.js tests/business.test.js
git commit -m "feat: add TAPHOA revision metadata read"
```

---

### Task 3: Add account-isolated TAPHOA snapshot storage

**Files:**
- Create: `src/core/snapshot.js`
- Create: `tests/snapshot.test.js`

**Interfaces:**
- Produces `createSnapshotStore({storage,cacheVersion})`.
- Methods:
  - `load(uid): object|null`
  - `save(uid,state): boolean`
  - `clear(uid): void`
- Snapshot key format: `taphoa.snapshot.v1:<uid>`.
- Cache version: integer `1` for this milestone.

- [ ] **Step 1: Write failing snapshot isolation tests**

Create `tests/snapshot.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotStore} from '../src/core/snapshot.js';

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key)
  };
}

const state={
  version:'SUPABASE-1',syncSeconds:30,revisions:{products:2},
  products:[{id:'tl1',ten:'Cứng',gia:125,von:124}],sources:[],customers:[],orders:[],debtSummary:[],printSettings:{},selfCustomer:null
};

test('snapshot round-trips for the same uid',()=>{
  const store=createSnapshotStore({storage:memoryStorage(),cacheVersion:1});
  assert.equal(store.save('u1',state),true);
  const snap=store.load('u1');
  assert.equal(snap.uid,'u1');
  assert.equal(snap.data.products[0].gia,125);
});

test('snapshot never loads for another uid',()=>{
  const storage=memoryStorage();
  const store=createSnapshotStore({storage,cacheVersion:1});
  store.save('u1',state);
  assert.equal(store.load('u2'),null);
});

test('snapshot with a different cache version is rejected',()=>{
  const storage=memoryStorage();
  createSnapshotStore({storage,cacheVersion:1}).save('u1',state);
  assert.equal(createSnapshotStore({storage,cacheVersion:2}).load('u1'),null);
});

test('clear removes only the requested uid snapshot',()=>{
  const storage=memoryStorage();
  const store=createSnapshotStore({storage,cacheVersion:1});
  store.save('u1',state);store.save('u2',state);
  store.clear('u1');
  assert.equal(store.load('u1'),null);
  assert.ok(store.load('u2'));
});
```

- [ ] **Step 2: Run snapshot tests and verify they fail because the module does not exist**

Run:

```bash
npm test -- tests/snapshot.test.js
```

Expected: FAIL with module-not-found for `src/core/snapshot.js`.

- [ ] **Step 3: Implement `src/core/snapshot.js`**

Implement a browser-safe module with no dependency on global `localStorage` until construction:

```js
const KEY_PREFIX='taphoa.snapshot.v1:';
const DATA_KEYS=['version','syncSeconds','revisions','products','sources','customers','orders','debtSummary','printSettings','selfCustomer'];

export function createSnapshotStore({storage=globalThis.localStorage,cacheVersion=1}={}){
  const key=uid=>`${KEY_PREFIX}${String(uid||'')}`;
  const pick=state=>Object.fromEntries(DATA_KEYS.map(k=>[k,state?.[k]]));
  return {
    load(uid){
      if(!uid||!storage)return null;
      try{
        const row=JSON.parse(storage.getItem(key(uid))||'null');
        if(!row||row.cacheVersion!==cacheVersion||String(row.uid)!==String(uid))return null;
        return row;
      }catch{return null;}
    },
    save(uid,state){
      if(!uid||!storage)return false;
      try{
        storage.setItem(key(uid),JSON.stringify({cacheVersion,uid:String(uid),savedAt:Date.now(),data:pick(state)}));
        return true;
      }catch{return false;}
    },
    clear(uid){
      if(!uid||!storage)return;
      try{storage.removeItem(key(uid));}catch{}
    }
  };
}
```

- [ ] **Step 4: Run snapshot tests**

Run:

```bash
npm test -- tests/snapshot.test.js
```

Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 5: Run all unit tests**

Run:

```bash
npm test
```

Expected: PASS, 11 tests, 0 failures.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/core/snapshot.js tests/snapshot.test.js
git commit -m "feat: add account-isolated TAPHOA snapshot"
```

---

### Task 4: Wire cache-first bootstrap and revision-based domain sync into the App Shell

**Files:**
- Modify: `src/app.js`

**Interfaces:**
- Consumes:
  - `createSnapshotStore()` from `src/core/snapshot.js`
  - `changedDomains()` and `appState.subscribe()` from `src/core/app-state.js`
  - `business.bootstrap()`, `business.meta()`, `business.domains()`
- Produces App Shell lifecycle functions:
  - `syncOnce({forceRender?:boolean})`
  - `startSync()`
  - `stopSync()`
  - `subscribeData(listener)` exposed in Screen Context

- [ ] **Step 1: Add imports and lifecycle state**

At top of `src/app.js`, import:

```js
import {createAppState,changedDomains} from './core/app-state.js';
import {createSnapshotStore} from './core/snapshot.js';
```

Replace the existing `createAppState` import accordingly, then create:

```js
const snapshot=createSnapshotStore();
let syncTimer=null;
let syncInFlight=null;
let lifecycleBound=false;
```

Keep only one timer for the whole app.

- [ ] **Step 2: Make `refresh(domains)` merge, persist, and notify through App State**

Keep current public signature `refresh(domains=[])`, but after `business.domains(unique)`:

```js
appState.mergeDomains(data||{});
if(identity?.uid) snapshot.save(identity.uid,appState.get());
return appState.get();
```

Do not directly mutate Screen-local arrays from App Shell.

- [ ] **Step 3: Implement one-at-a-time revision sync**

Add:

```js
async function syncOnce(){
  if(!identity?.uid||navigator.onLine===false||document.hidden)return appState.get();
  if(syncInFlight)return syncInFlight;
  syncInFlight=(async()=>{
    const meta=await business.meta();
    const changed=changedDomains(appState.get().revisions,meta?.revisions||{});
    if(changed.length) await refresh(changed);
    return appState.get();
  })().finally(()=>{syncInFlight=null;});
  return syncInFlight;
}
```

Important: `refresh(changed)` passes logical domain names directly to `app_domains`; backend already maps `products` to products+sources and `customers` to customers+selfCustomer.

- [ ] **Step 4: Implement start/stop sync with backend cadence**

Add:

```js
function stopSync(){
  if(syncTimer){clearInterval(syncTimer);syncTimer=null;}
  syncInFlight=null;
}

function startSync(){
  stopSync();
  const seconds=Math.max(10,Number(appState.get().syncSeconds)||30);
  syncTimer=setInterval(()=>{syncOnce().catch(error=>console.warn('data sync',error));},seconds*1000);
}
```

Do not show a blocking toast for transient meta/domain network failure; current state remains visible and next interval retries.

- [ ] **Step 5: Add online and visibility recovery hooks exactly once**

Add one-time binding:

```js
function bindLifecycleSync(){
  if(lifecycleBound)return;
  lifecycleBound=true;
  window.addEventListener('online',()=>{if(identity)syncOnce().catch(()=>{});});
  document.addEventListener('visibilitychange',()=>{
    if(identity&&!document.hidden)syncOnce().catch(()=>{});
  });
}
```

Call `bindLifecycleSync()` once during module boot, not on each login.

- [ ] **Step 6: Change `openApp(sessionInfo)` to cache-first then server-authoritative bootstrap**

Implement this ordering:

```js
async function openApp(sessionInfo){
  const token=++appOpenToken;
  identity=sessionInfo.identity;
  const uid=String(identity?.uid||sessionInfo?.session?.user?.id||'');

  const cached=snapshot.load(uid);
  if(cached?.data){
    appState.setBootstrap(cached.data);
    $('loginScreen').hidden=true;
    $('appShell').hidden=false;
  }

  if(navigator.onLine!==false){
    const bootstrap=await business.bootstrap();
    if(token!==appOpenToken)return;
    appState.setBootstrap(bootstrap||{});
    snapshot.save(uid,appState.get());
  }else if(!cached?.data){
    throw Object.assign(new Error('Chưa có dữ liệu đã lưu cho tài khoản này'),{code:'OFFLINE_NO_CACHE'});
  }

  if(token!==appOpenToken)return;
  $('loginScreen').hidden=true;
  $('appShell').hidden=false;
  router?.destroy();
  router=createRouter({onRoute:mountRoute});
  router.start();
  startSync();
}
```

If cached data was shown before bootstrap, do not start a second router. Ensure router construction occurs once after the server attempt/offline decision.

- [ ] **Step 7: Stop sync and clear runtime state during login reset/logout path**

At beginning of `openLogin()` call `stopSync()` before resetting App State/router.

Do not clear a valid saved snapshot merely because a session expires or user logs out; the spec requires clearing runtime state and account isolation, while cache remains safe under uid-specific keys for fast restore. If an explicit "forget local data" action is later added, it may call `snapshot.clear(uid)`; that is outside this milestone.

- [ ] **Step 8: Expose App State subscription only through Screen Context**

Extend `screenContext(root)` with:

```js
subscribeData:listener=>appState.subscribe(listener)
```

Screens still receive `getData()` and `refresh()`; they do not get direct Supabase access.

- [ ] **Step 9: Static syntax verification**

Run:

```bash
node --check src/app.js
node --check src/core/app-state.js
node --check src/core/business.js
node --check src/core/snapshot.js
npm test
```

Expected: all `node --check` commands exit 0; all tests PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add src/app.js src/core/app-state.js src/core/business.js src/core/snapshot.js
git commit -m "feat: sync TAPHOA data by server revision"
```

---

### Task 5: Make only the Active Screen react to refreshed App State

**Files:**
- Modify: `src/screens/sales.js`
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/pending.js`
- Modify: `src/screens/debt.js`

**Interfaces:**
- Consumes: `context.subscribeData(listener)` where listener receives `{state,changed}`.
- Produces: one unsubscribe function per mounted screen, called by that screen's existing cleanup function.

- [ ] **Step 1: Update Sales to accept refreshed products/customers without destroying local cart state**

Inside `mount(context)`, after local state initialization, subscribe:

```js
const unsubscribeData=context.subscribeData?.(({state:next,changed})=>{
  if(!changed.some(x=>x==='bootstrap'||x==='products'||x==='customers'))return;
  state={...state,products:next.products||[],customers:next.customers||[]};
  render();
});
```

Do not replace `cart`, `prices`, `notes`, `lineNos`, `selectedCustomer`, `search`, or `group` during background sync.

Extend the existing cleanup return to call `unsubscribeData?.()` before/after removing DOM event listeners.

- [ ] **Step 2: Update Delivered to react only to order/product/customer changes it displays**

Add subscription in `mount(context)`:

```js
const unsubscribeData=context.subscribeData?.(({changed})=>{
  if(changed.some(x=>x==='bootstrap'||x==='orders'||x==='products'||x==='customers'))render();
});
```

The existing `render()` already re-reads `context.getData().orders`; keep filter/search/calendar/detail UI state intact.

Call `unsubscribeData?.()` in cleanup.

- [ ] **Step 3: Update Pending to react to order/product/customer changes**

Use the same pattern but only for:

```js
['bootstrap','orders','products','customers']
```

Ensure its render path re-reads current App State orders and does not reset its current search/selection/detail state.

Call `unsubscribeData?.()` in cleanup.

- [ ] **Step 4: Update Debt to react to debt/customer/order changes**

Subscribe only to:

```js
['bootstrap','debt','customers','orders']
```

On event, update/re-read summary source data and render current debt stage. Do not force navigation back to debt list and do not discard current customer/order drill-down identifiers.

Call `unsubscribeData?.()` in cleanup.

- [ ] **Step 5: Verify screen modules parse and unit tests remain green**

Run:

```bash
node --check src/screens/sales.js
node --check src/screens/delivered.js
node --check src/screens/pending.js
node --check src/screens/debt.js
npm test
```

Expected: syntax checks exit 0 and all unit tests PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/screens/sales.js src/screens/delivered.js src/screens/pending.js src/screens/debt.js
git commit -m "feat: refresh active TAPHOA screen from app state"
```

---

### Task 6: Verify live Supabase contract and regression gates without changing backend

**Files:**
- No backend/schema changes.
- Optionally append verification notes to the implementation checkpoint only after evidence is collected.

**Interfaces:**
- Consumes existing Supabase RPCs: `app_bootstrap`, `app_meta`, `app_domains`.
- Produces verification evidence only; no production deployment.

- [ ] **Step 1: Verify the database gate directly**

Run a read-only Supabase SQL query against project `crdbhkdeqyehsbzgggbs`:

```sql
select
  (select count(*) from public.products) as products,
  (select count(*) from public.product_sources) as sources,
  (select count(*) from public.customers) as customers,
  (select jsonb_build_object('id',id,'name',name,'price',price,'cost',cost)
     from public.products where id='tl1') as tl1,
  (select revision from public.business_revisions where domain='products') as products_revision;
```

Expected current data values:
- products = 649
- sources = 5
- customers = 38
- `tl1.name = Cứng`
- `tl1.price = 125`
- `tl1.cost = 124`
- products revision is a positive integer.

- [ ] **Step 2: Verify backend frontend-contract mapping remains unchanged**

Read `public.product_frontend_json(products)` definition and confirm it still maps:

```text
name -> ten
product_group -> nhom
unit -> donVi
price -> gia
cost -> von (admin only)
pack_unit -> donViLe
pack_qty -> quyCach
case_qty -> quyDoiThung
price / pack_qty -> giaLe
```

Do not modify the function.

- [ ] **Step 3: Verify a valid admin bootstrap returns the gate bundle**

Using an authenticated admin browser/session or safe equivalent, inspect `app_bootstrap()` result and verify:

```text
products.length = 649
sources.length = 5
customers.length = 38
products.find(p => p.id === 'tl1') = { ten:'Cứng', gia:125, von:124, ... }
```

This is a read verification only; do not change credentials.

- [ ] **Step 4: Verify revision-driven products refresh**

In a controlled test, record local `revisions.products`, then make a safe metadata-only revision bump using the existing `bump_business_revision('products')` function, without editing product rows. Confirm on TAPHOA:

1. next `app_meta()` sees a different `products` revision;
2. exactly the products logical domain is requested from `app_domains`;
3. App State keeps customers/orders/debt unchanged;
4. Active Screen refreshes without browser reload.

If this verification bump is performed, record old/new revision values. Do not alter schema/data values.

- [ ] **Step 5: Verify customer-domain isolation**

Perform the same controlled revision-only check for `customers` only if the existing revision bump function supports it safely. Confirm products/orders/debt arrays retain their current references/content while customers/selfCustomer update from the returned bundle.

- [ ] **Step 6: Browser regression pass**

Serve locally:

```bash
python -m http.server 8080
```

Verify in browser:

```text
Login admin -> PASS
Bán hàng shows product names and prices -> PASS
tl1 shows Cứng / 125; admin cost path sees 124 where UI exposes cost -> PASS
Reload while online -> PASS
Reload with a valid snapshot then temporarily offline -> cached data remains visible -> PASS
Return online -> meta sync runs and state remains populated -> PASS
Navigate Bán -> Đã giao -> Đơn tạm -> Công nợ -> only active screen is mounted -> PASS
No duplicate sync timers after route changes -> PASS
No console errors -> PASS
No production deployment performed -> PASS
```

- [ ] **Step 7: Run final static/unit verification**

Run:

```bash
npm test
node --check src/app.js
node --check src/core/app-state.js
node --check src/core/business.js
node --check src/core/snapshot.js
node --check src/screens/sales.js
node --check src/screens/delivered.js
node --check src/screens/pending.js
node --check src/screens/debt.js
```

Expected: 0 failing tests and 0 syntax errors.

- [ ] **Step 8: Commit verification/checkpoint notes only if a tracked note file is created or updated**

If implementation execution maintains a checkpoint file, commit only evidence gathered in Steps 1–7. Do not create a production deployment commit.

---

## Self-Review Results

- Spec coverage: bootstrap, meta/revision comparison, domain refresh, snapshot isolation, account/session lifecycle, Active Screen subscription, product price contract, failure behavior, and browser/data gates are all assigned to concrete tasks.
- Scope: mutation queue/outbox, optimistic reconcile, realtime business channel, push notifications, customer Auth creation, UI redesign, backend/schema/RLS changes, and production deployment remain explicitly outside this plan.
- Placeholder scan: no `TBD`, `TODO`, "similar to", or unspecified implementation step remains.
- Interface consistency: `changedDomains()`, `createSnapshotStore()`, `appState.subscribe()`, `business.meta()`, and `context.subscribeData()` use the same names/signatures throughout all tasks.
