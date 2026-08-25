# TAPHOA Structural Region & Function Flow Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến đặc tả phân vùng TAPHOA thành một guardrail có thể kiểm tra bằng code/CI, rồi chuẩn hóa Auth + 4 Screen theo cùng Semantic Tree, Slot 1/2/3, Parent–Child, owner và function-flow contract mà không đổi business/data/backend contract.

**Architecture:** Tách hai lớp rõ ràng: `src/core/ui-structure.js` chỉ cung cấp validator/auditor thuần, còn `src/contracts/ui-structure.js` khai báo Root/Screen/Surface/Region/Flow cụ thể. DOM dùng các marker semantic ổn định (`data-ui-node`, `data-ui-id`, `data-parent-id`, `data-slot-mobile`, `data-slot-wide`) để auditor so với contract; CSS vẫn thuộc owner của từng Screen. `src/core/screen-registry.js` là registry top-level duy nhất cho 4 Screen và loader, còn Router chỉ xử lý route/lifecycle.

**Tech Stack:** HTML5, CSS Container Queries, JavaScript ES modules, Node.js 22 `node:test`, GitHub Actions; không thêm runtime dependency và không thêm parser/browser library chỉ để audit static.

**Spec:** `docs/superpowers/specs/2026-08-25-taphoa-structural-region-flow-guardrail-design.md`

## Global Constraints

- TAPHOA chỉ có 4 Screen nghiệp vụ top-level: `sales`, `delivered`, `pending`, `debt`.
- Login/Auth là Root thay thế App Root, không phải Screen và không nằm trong Slot 1/2/3.
- Mobile chỉ dùng placement Slot 1; PC/Wide có thể dùng Slot 2/3 nhưng không tạo business flow thứ hai.
- Semantic parent không đổi khi responsive đổi placement.
- Bố cục/UX đang hiển thị là reference; không tự đổi nghiệp vụ, tài chính, giá, quyền, Supabase schema/RPC/RLS, dữ liệu thật hoặc deploy production.
- Backend/Auth/Data contract đang đúng phải giữ nguyên. UI không được tự quyết quyền nghiệp vụ.
- `Lưu mật khẩu` hiện mâu thuẫn với runtime chỉ lưu username; sửa copy thành `Nhớ tên đăng nhập`, tuyệt đối không thêm lưu password.
- Mỗi Region quan trọng phải có Name/ID, Parent, Children, Purpose và owner rõ cho geometry, paint, interaction, state/data, scroll, focus/keyboard.
- Parent sở hữu quan hệ hình học giữa các Con; không vá lỗi Cha ở Con bằng margin/top/z-index/fixed/width hack.
- Danh sách dài là scroll owner; Viewport/App Root/Active Screen không cuộn thay list.
- Một user action chỉ có một mutation owner. Back phải có target và khôi phục context phù hợp.
- Static/contract PASS không được gọi là browser/device PASS.
- Không giữ class/tên vô nghĩa chỉ vì code cũ đang chạy; đổi tên khi node đang thực hiện semantic responsibility rõ ràng.

---

## File Structure

### Create

- `src/core/ui-structure.js` — validator/auditor thuần cho contract + markup, không biết business cụ thể.
- `src/contracts/ui-structure.js` — Auth/App/4 Screen structural contracts + flow contracts.
- `src/core/screen-registry.js` — registry duy nhất của 4 Screen, nav metadata và lazy loader.
- `scripts/audit-ui-structure.mjs` — CLI trả gate report và exit code cho CI.
- `tests/rules-source-contract.test.js` — khóa nguồn quy tắc TAPHOA duy nhất.
- `tests/ui-structure-model.test.js` — validator model, parent/owner/slot/flow invariants.
- `tests/screen-registry.test.js` — registry/router boundary.
- `tests/auth-structure-contract.test.js` — Auth Root/App Root/copy remember-user contract.
- `tests/sales-structure-contract.test.js` — Sales semantic/placement/scroll contract.
- `tests/delivered-structure-contract.test.js` — Delivered list/detail/print surface contract.
- `tests/pending-structure-contract.test.js` — Pending list/source/order/print surface contract.
- `tests/debt-structure-contract.test.js` — Debt customer/ledger/order surface contract.
- `.github/workflows/ui-guardrail-check.yml` — CI cho tests + audit + parse.

### Modify

- `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt` — merge đặc tả đã duyệt vào nguồn quy tắc vận hành duy nhất.
- `index.html` — Auth/App semantic root markers; chia Auth regions; System Layer wrapper; copy `Nhớ tên đăng nhập`.
- `src/app.js` — dùng Screen Registry; giữ root state lifecycle hiện tại.
- `src/core/router.js` — bỏ ownership của Screen metadata; nhận allowed screen IDs từ registry.
- `src/screens/sales.js`, `src/styles/sales.css` — Sales Workspace/Surface/Region/Slot placement.
- `src/screens/delivered.js`, `src/styles/delivered.css` — Delivered Surface placement + back path.
- `src/screens/pending.js`, `src/styles/pending.css` — Pending Surface placement + back path.
- `src/screens/debt.js`, `src/styles/debt.css` — Debt 3-level Surface placement + back path.
- `src/core/scroll-owner.js`, `src/styles/scroll-owner.css` — selectors theo semantic region IDs; giữ restore `scrollTop`.
- `tests/scroll-owner-contract.test.js` — đổi selector contract sang region IDs mới.
- `package.json` — thêm `audit:ui` script.

### Remove after replacement is green

- `.github/workflows/scroll-owner-check.yml` — workflow branch-specific cũ, vì `ui-guardrail-check.yml` bao gồm scroll-owner test.

---

## Contract Marker Convention

Mọi node cấu trúc dùng marker sau; marker không render ra UI:

```html
<section
  data-ui-node="region"
  data-ui-id="sales-product-list"
  data-parent-id="sales-primary-surface"
  data-slot-mobile="1"
  data-slot-wide="1">
</section>
```

`data-slot-*` chỉ đặt ở `surface`; Region thừa hưởng placement từ Surface cha. Root dùng `data-root-id`, Screen tiếp tục dùng `data-screen-id`.

Node kinds hợp lệ:

```js
export const UI_NODE_KINDS = Object.freeze([
  'root', 'navigation', 'screen-host', 'system-layer',
  'workspace', 'surface', 'region'
]);
```

Owners bắt buộc:

```js
export const REQUIRED_OWNER_KEYS = Object.freeze([
  'geometry', 'paint', 'interaction', 'state', 'scroll', 'focus'
]);
```

Flow fields bắt buộc:

```js
export const REQUIRED_FLOW_KEYS = Object.freeze([
  'id', 'source', 'action', 'mutationOwner', 'targetState', 'targetRegion', 'back'
]);
```

---

### Task 1: Merge Approved Rules into the Single TAPHOA Rule Source

**Files:**
- Modify: `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt`
- Create: `tests/rules-source-contract.test.js`

**Interfaces:**
- Consumes: approved design spec.
- Produces: one operational rule source containing Root/Slot/Region/Flow/Naming/Gate contracts; later tasks must not create a competing rule file.

- [ ] **Step 1: Write the failing rule-source test**

Create `tests/rules-source-contract.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rules=readFileSync(new URL('../docs/TAPHOA_QUY_TAC_LAM_VIEC.txt',import.meta.url),'utf8');

const required=[
  'AUTH ROOT / APP ROOT',
  'SLOT 1 / SLOT 2 / SLOT 3',
  'SEMANTIC TREE / PLACEMENT TREE',
  'REGION CONTRACT',
  'PARENT–CHILD CONTRACT',
  'NAMING / CODE ORDER CONTRACT',
  'FUNCTION FLOW CONTRACT',
  'SCROLL / FOCUS / KEYBOARD CONTRACT',
  'STRUCTURE GATE'
];

test('TAPHOA single rule source contains the approved structural guardrail',()=>{
  for(const token of required)assert.ok(rules.includes(token),`missing rule section: ${token}`);
});

test('rule source keeps Auth outside business Screens',()=>{
  assert.match(rules,/Login\/Auth.+không phải Screen nghiệp vụ/s);
  assert.match(rules,/Auth Root.+App Root.+thay thế nhau/s);
});

test('rule source forbids password persistence copy mismatch',()=>{
  assert.match(rules,/Nhớ tên đăng nhập/);
  assert.match(rules,/không lưu password|không lưu mật khẩu/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/rules-source-contract.test.js
```

Expected: FAIL because the current short rule file does not contain all approved sections.

- [ ] **Step 3: Merge the approved design into the existing rule file, do not append a competing document**

Keep the current 16 rules, then merge/expand them under these exact headings:

```text
0. NGUỒN / THỨ TỰ HIỆU LỰC
1. AUTH ROOT / APP ROOT
2. CÂY NỀN CHA–CON
3. SLOT 1 / SLOT 2 / SLOT 3
4. SEMANTIC TREE / PLACEMENT TREE
5. REGION CONTRACT
6. OWNER CONTRACT
7. PARENT–CHILD CONTRACT
8. NAMING / CODE ORDER CONTRACT
9. FUNCTION FLOW CONTRACT
10. SCROLL / FOCUS / KEYBOARD CONTRACT
11. RESPONSIVE / GEOMETRY CONTRACT
12. RUNTIME / ACTIVE SCREEN CONTRACT
13. BUSINESS / AUTH / DATA SAFETY
14. STRUCTURE GATE
15. TEST / PASS LANGUAGE
```

The Login copy rule must say exactly in meaning:

```text
Checkbox hiện chỉ lưu username/local hint phải hiển thị "Nhớ tên đăng nhập".
Không được đổi implementation sang lưu password để khớp nhãn cũ.
```

- [ ] **Step 4: Run rule-source test**

```bash
node --test tests/rules-source-contract.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full existing suite to prove documentation work did not affect runtime**

```bash
npm test
```

Expected: all pre-existing tests + rule-source tests PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/TAPHOA_QUY_TAC_LAM_VIEC.txt tests/rules-source-contract.test.js
git commit -m "docs: merge TAPHOA structural guardrail rules"
```

---

### Task 2: Build the Structural Contract Model, Screen Registry, and Static Auditor API

**Files:**
- Create: `src/core/ui-structure.js`
- Create: `src/contracts/ui-structure.js`
- Create: `src/core/screen-registry.js`
- Modify: `src/core/router.js`
- Modify: `src/app.js`
- Create: `tests/ui-structure-model.test.js`
- Create: `tests/screen-registry.test.js`

**Interfaces:**
- Produces: `validateStructureContract(contract) -> string[]`
- Produces: `auditMarkupStructure(html, contract) -> {pass:boolean, errors:string[], gates:object}`
- Produces: `AUTH_STRUCTURE_CONTRACT`, `APP_STRUCTURE_CONTRACT`, `SCREEN_STRUCTURE_CONTRACTS`
- Produces: `SCREEN_REGISTRY`, `NAV_ITEMS`, `SCREEN_IDS`, `loadRegisteredScreen(id)`
- Router consumes: `screenIds` and `fallback`; router no longer owns Screen metadata.

- [ ] **Step 1: Write validator tests first**

Create `tests/ui-structure-model.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStructureContract,auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const good={
  id:'probe',
  root:{id:'probe-root',kind:'root',attribute:'data-root-id',value:'probe'},
  nodes:[
    {id:'probe-workspace',kind:'workspace',parent:'probe-root',children:['probe-list'],purpose:'workspace',owners:{geometry:'self',paint:'self',interaction:'none',state:'probe-controller',scroll:'none',focus:'none'},order:1},
    {id:'probe-list',kind:'region',parent:'probe-workspace',children:[],purpose:'data list',owners:{geometry:'probe-workspace',paint:'self',interaction:'probe-controller',state:'probe-controller',scroll:'self',focus:'none'},order:1}
  ],
  flows:[{id:'probe.open',source:'probe-list',action:'open',mutationOwner:'probe-controller',targetState:'selected',targetRegion:'probe-list',back:'stay:probe'}]
};

test('validator accepts a complete contract',()=>assert.deepEqual(validateStructureContract(good),[]));

test('validator rejects a missing owner',()=>{
  const bad=structuredClone(good);delete bad.nodes[1].owners.scroll;
  assert.match(validateStructureContract(bad).join('\n'),/probe-list.+scroll/);
});

test('validator rejects unresolved parent',()=>{
  const bad=structuredClone(good);bad.nodes[1].parent='missing-parent';
  assert.match(validateStructureContract(bad).join('\n'),/missing-parent/);
});

test('validator rejects mobile placement outside Slot 1',()=>{
  const bad=structuredClone(good);bad.nodes[1].kind='surface';bad.nodes[1].placement={mobile:2,wide:2};
  assert.match(validateStructureContract(bad).join('\n'),/mobile.+Slot 1/i);
});

test('all approved TAPHOA contracts are structurally valid',()=>{
  const all=[AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,...Object.values(SCREEN_STRUCTURE_CONTRACTS)];
  for(const contract of all)assert.deepEqual(validateStructureContract(contract),[],contract.id);
});

test('markup audit verifies semantic markers and parent ids',()=>{
  const html='<section data-root-id="probe"><div data-ui-node="workspace" data-ui-id="probe-workspace" data-parent-id="probe-root"><div data-ui-node="region" data-ui-id="probe-list" data-parent-id="probe-workspace"></div></div></section>';
  const result=auditMarkupStructure(html,good);
  assert.equal(result.pass,true,result.errors.join('\n'));
});
```

- [ ] **Step 2: Run model tests and verify RED**

```bash
node --test tests/ui-structure-model.test.js
```

Expected: FAIL because `ui-structure.js` and contract modules do not exist.

- [ ] **Step 3: Implement `src/core/ui-structure.js` with no DOM/runtime dependency**

Use this public shape:

```js
export const UI_NODE_KINDS=Object.freeze(['root','navigation','screen-host','system-layer','workspace','surface','region']);
export const REQUIRED_OWNER_KEYS=Object.freeze(['geometry','paint','interaction','state','scroll','focus']);
export const REQUIRED_FLOW_KEYS=Object.freeze(['id','source','action','mutationOwner','targetState','targetRegion','back']);

const attrMap=tag=>{
  const out={};
  for(const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g))out[match[1]]=match[2];
  return out;
};

export function validateStructureContract(contract){
  const errors=[];
  if(!contract?.id)errors.push('contract.id missing');
  if(!contract?.root?.id)errors.push(`${contract?.id||'contract'} root.id missing`);
  const nodes=Array.isArray(contract?.nodes)?contract.nodes:[];
  const known=new Set([contract?.root?.id,...nodes.map(node=>node?.id)].filter(Boolean));
  const byId=new Map(nodes.map(node=>[node.id,node]));

  for(const node of nodes){
    if(!node.id)errors.push(`${contract.id} node id missing`);
    if(!UI_NODE_KINDS.includes(node.kind))errors.push(`${node.id} invalid kind ${node.kind}`);
    if(!known.has(node.parent))errors.push(`${node.id} unresolved parent ${node.parent}`);
    if(!Array.isArray(node.children))errors.push(`${node.id} children must be explicit array`);
    if(!String(node.purpose||'').trim())errors.push(`${node.id} purpose missing`);
    for(const key of REQUIRED_OWNER_KEYS)if(!String(node.owners?.[key]||'').trim())errors.push(`${node.id} owner ${key} missing`);
    if(node.kind==='surface'){
      if(Number(node.placement?.mobile)!==1)errors.push(`${node.id} mobile placement must use Slot 1`);
      if(![1,2,3].includes(Number(node.placement?.wide)))errors.push(`${node.id} wide placement must use Slot 1/2/3`);
    }
    for(const child of node.children||[]){
      if(!byId.has(child))errors.push(`${node.id} child ${child} missing`);
      else if(byId.get(child).parent!==node.id)errors.push(`${node.id} child ${child} parent mismatch`);
    }
  }

  for(const flow of contract?.flows||[]){
    for(const key of REQUIRED_FLOW_KEYS)if(!String(flow?.[key]||'').trim())errors.push(`${contract.id} flow ${flow?.id||'?'} field ${key} missing`);
  }
  return errors;
}

export function auditMarkupStructure(html='',contract){
  const errors=[...validateStructureContract(contract)];
  const rootToken=`${contract.root.attribute}="${contract.root.value}"`;
  if(!html.includes(rootToken))errors.push(`${contract.id} root marker missing: ${rootToken}`);

  const positions=[];
  for(const node of contract.nodes||[]){
    const token=`data-ui-id="${node.id}"`;
    const index=html.indexOf(token);
    if(index<0){errors.push(`${contract.id} markup missing ${node.id}`);continue;}
    const start=html.lastIndexOf('<',index),end=html.indexOf('>',index);
    const attrs=attrMap(html.slice(start,end+1));
    if(attrs['data-ui-node']!==node.kind)errors.push(`${node.id} kind marker mismatch`);
    if(attrs['data-parent-id']!==node.parent)errors.push(`${node.id} parent marker mismatch`);
    if(node.kind==='surface'){
      if(Number(attrs['data-slot-mobile'])!==node.placement.mobile)errors.push(`${node.id} mobile slot marker mismatch`);
      if(Number(attrs['data-slot-wide'])!==node.placement.wide)errors.push(`${node.id} wide slot marker mismatch`);
    }
    positions.push({node,index});
  }

  const groups=new Map();
  for(const item of positions){
    const list=groups.get(item.node.parent)||[];list.push(item);groups.set(item.node.parent,list);
  }
  for(const list of groups.values()){
    const expected=[...list].sort((a,b)=>a.node.order-b.node.order).map(x=>x.node.id);
    const actual=[...list].sort((a,b)=>a.index-b.index).map(x=>x.node.id);
    if(expected.join('|')!==actual.join('|'))errors.push(`${contract.id} source order mismatch for parent ${list[0]?.node.parent}`);
  }

  return {
    pass:errors.length===0,
    errors,
    gates:{tree:errors.length===0,naming:errors.length===0,owner:errors.length===0,placement:errors.length===0,flow:errors.length===0}
  };
}
```

- [ ] **Step 4: Define exact Root/Screen contract IDs in `src/contracts/ui-structure.js`**

Use these node IDs and placements exactly; every node gets explicit `children`, `purpose`, `owners`, `order`:

```text
AUTH
root: auth-root
  auth-workspace
    auth-brand-region
    auth-credential-region
    auth-preference-region
    auth-status-region
    auth-action-region

APP
root: app-root
  app-navigation
  app-screen-host
  app-system-layer

SALES
root: sales-root
  sales-workspace
    sales-primary-surface      mobile=1 wide=1
      sales-context-region
      sales-product-controls
      sales-product-list      scroll=self
    sales-cart-surface         mobile=1 wide=2
      sales-cart-list          scroll=self
      sales-cart-total
      sales-cart-actions

DELIVERED
root: delivered-root
  delivered-workspace
    delivered-list-surface     mobile=1 wide=1
      delivered-filter-region
      delivered-summary-region
      delivered-order-list     scroll=self
    delivered-detail-surface   mobile=1 wide=2
      delivered-detail-meta
      delivered-detail-lines   scroll=self
      delivered-detail-actions
    delivered-print-surface    mobile=1 wide=3
      delivered-print-meta
      delivered-print-lines    scroll=self
      delivered-print-actions

PENDING
root: pending-root
  pending-workspace
    pending-list-surface       mobile=1 wide=1
      pending-summary-region
      pending-order-list       scroll=self
    pending-source-surface     mobile=1 wide=2
      pending-source-meta
      pending-source-lines     scroll=self
      pending-source-actions
    pending-detail-surface     mobile=1 wide=2
      pending-detail-meta
      pending-detail-lines     scroll=self
      pending-detail-actions
    pending-print-surface      mobile=1 wide=3
      pending-print-meta
      pending-print-lines      scroll=self
      pending-print-actions

DEBT
root: debt-root
  debt-workspace
    debt-list-surface          mobile=1 wide=1
      debt-summary-region
      debt-quick-action-region
      debt-customer-list       scroll=self
    debt-ledger-surface        mobile=1 wide=2
      debt-ledger-meta
      debt-ledger-list         scroll=self
      debt-ledger-actions
    debt-order-surface         mobile=1 wide=3
      debt-order-meta
      debt-order-lines         scroll=self
      debt-order-actions
```

Owner rules used in the contract module:

```js
const owners=({geometry='parent',paint='self',interaction='none',state='screen-controller',scroll='none',focus='none'}={})=>
  Object.freeze({geometry,paint,interaction,state,scroll,focus});
```

Use `interaction:'sales-controller'`, `state:'sales-controller'` etc. for Screen interactive regions; use `interaction:'auth-controller'`, `state:'auth-service'` for Auth; use `interaction:'app-shell'` for navigation; use `state:'app-state'` where the region only reads shared state. Input-containing regions set `focus:'self'`. Lists set `scroll:'self'`. Non-interactive presentational regions must use explicit `interaction:'none'`, never blank.

Declare these primary flow IDs exactly:

```text
sales.search
sales.group.select
sales.quantity.change
sales.cart.open
sales.cart.back
sales.order.pending
sales.order.done
sales.order.update
sales.cart.clear

delivered.filter.search
delivered.filter.date
delivered.order.open
delivered.detail.back
delivered.order.edit
delivered.order.print
delivered.order.reverse

pending.source.open
pending.source.back
pending.order.open
pending.order.back
pending.order.edit
pending.order.deliver
pending.order.delete
pending.orders.delete-all
pending.order.print

debt.customer.open
debt.ledger.back
debt.transaction.collect
debt.transaction.debt
debt.order.open
debt.order.back
debt.share
```

Each flow object must provide all seven required fields. `back` uses one of `stay:<screen>`, `surface:<surface-id>`, or `route:<screen-id>`; no empty back path.

- [ ] **Step 5: Run model tests**

```bash
node --test tests/ui-structure-model.test.js
```

Expected: PASS.

- [ ] **Step 6: Write Screen Registry tests**

Create `tests/screen-registry.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {SCREEN_IDS,SCREEN_REGISTRY,NAV_ITEMS} from '../src/core/screen-registry.js';
import {normalizeRoute} from '../src/core/router.js';

test('registry contains exactly the four approved business screens',()=>{
  assert.deepEqual(SCREEN_IDS,['sales','delivered','pending','debt']);
  assert.deepEqual(Object.keys(SCREEN_REGISTRY),SCREEN_IDS);
  assert.deepEqual(NAV_ITEMS.map(x=>x.id),SCREEN_IDS);
});

test('router uses caller supplied screen ids instead of owning screen metadata',()=>{
  assert.equal(normalizeRoute('#debt',SCREEN_IDS),'debt');
  assert.equal(normalizeRoute('#unknown',SCREEN_IDS),'sales');
});
```

- [ ] **Step 7: Implement `src/core/screen-registry.js` and make Router generic**

`src/core/screen-registry.js`:

```js
export const SCREEN_REGISTRY=Object.freeze({
  sales:Object.freeze({id:'sales',icon:'🛒',label:'Bán hàng',load:()=>import('../screens/sales.js')}),
  delivered:Object.freeze({id:'delivered',icon:'📋',label:'Đã giao',load:()=>import('../screens/delivered.js')}),
  pending:Object.freeze({id:'pending',icon:'📝',label:'Đơn tạm',load:()=>import('../screens/pending.js')}),
  debt:Object.freeze({id:'debt',icon:'💰',label:'Công nợ',load:()=>import('../screens/debt.js')})
});
export const SCREEN_IDS=Object.freeze(Object.keys(SCREEN_REGISTRY));
export const NAV_ITEMS=Object.freeze(SCREEN_IDS.map(id=>Object.freeze({id,icon:SCREEN_REGISTRY[id].icon,label:SCREEN_REGISTRY[id].label})));
export const loadRegisteredScreen=id=>SCREEN_REGISTRY[id]?.load?.();
```

Modify `src/core/router.js` public signatures to:

```js
export function normalizeRoute(value='',screenIds=['sales','delivered','pending','debt'],fallback='sales'){
  const approved=new Set(screenIds);
  const raw=String(value||'').replace(/^#\/?/,'').split('/')[0].trim();
  return approved.has(raw)?raw:fallback;
}

export function createRouter({onRoute,screenIds=['sales','delivered','pending','debt'],fallback='sales'}={}){
  const emit=()=>onRoute?.(normalizeRoute(location.hash,screenIds,fallback));
  const navigate=id=>{
    const next=normalizeRoute(`#${id}`,screenIds,fallback);
    if(location.hash!==`#${next}`)location.hash=next;else emit();
  };
  window.addEventListener('hashchange',emit);
  return {start:emit,navigate,destroy:()=>window.removeEventListener('hashchange',emit)};
}
```

Update `src/app.js` imports and loader only; do not alter business/sync/auth behavior:

```js
import {SCREEN_IDS,NAV_ITEMS,loadRegisteredScreen} from './core/screen-registry.js';
import {createRouter,normalizeRoute} from './core/router.js';
```

Replace the local `loadScreen()` map with `loadRegisteredScreen()`, pass `SCREEN_IDS` into `normalizeRoute()` and `createRouter()`.

- [ ] **Step 8: Run registry + full tests**

```bash
node --test tests/ui-structure-model.test.js tests/screen-registry.test.js
npm test
```

Expected: PASS.

- [ ] **Step 9: Parse new core files**

```bash
node --check src/core/ui-structure.js
node --check src/contracts/ui-structure.js
node --check src/core/screen-registry.js
node --check src/core/router.js
node --check src/app.js
```

Expected: all exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/core/ui-structure.js src/contracts/ui-structure.js src/core/screen-registry.js src/core/router.js src/app.js tests/ui-structure-model.test.js tests/screen-registry.test.js
git commit -m "feat: add TAPHOA structural contract model"
```

---

### Task 3: Normalize Auth Root and App Root Without Changing Auth Behavior

**Files:**
- Modify: `index.html`
- Modify: `src/styles/shell.css`
- Create: `tests/auth-structure-contract.test.js`

**Interfaces:**
- Consumes: `AUTH_STRUCTURE_CONTRACT`, `APP_STRUCTURE_CONTRACT`, `auditMarkupStructure()`.
- Produces: semantic Auth/App root markup with the same existing IDs used by `src/app.js` and `src/core/auth.js`.

- [ ] **Step 1: Write failing Auth/App markup tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT} from '../src/contracts/ui-structure.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Auth Root matches approved semantic tree',()=>{
  const result=auditMarkupStructure(html,AUTH_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('App Root matches Navigation Screen Host System Layer tree',()=>{
  const result=auditMarkupStructure(html,APP_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('remember copy describes what runtime actually persists',()=>{
  assert.match(html,/Nhớ tên đăng nhập/);
  assert.doesNotMatch(html,/Lưu mật khẩu/);
});

test('existing auth control ids remain stable',()=>{
  for(const id of ['loginForm','loginUsername','loginPassword','loginEye','loginRemember','loginError','loginSubmit','loginScreen','appShell','appNav','screenHost','systemToast']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/auth-structure-contract.test.js
```

Expected: FAIL because semantic markers and new copy are absent.

- [ ] **Step 3: Rewrite Auth markup semantically while preserving existing control IDs**

Target structure:

```html
<section class="login-screen" id="loginScreen" data-root-id="auth" data-ui-node="root">
  <form class="auth-workspace" id="loginForm" data-ui-node="workspace" data-ui-id="auth-workspace" data-parent-id="auth-root">
    <header class="auth-brand-region" data-ui-node="region" data-ui-id="auth-brand-region" data-parent-id="auth-workspace">...</header>
    <div class="auth-card-surface">
      <section class="auth-credential-region" data-ui-node="region" data-ui-id="auth-credential-region" data-parent-id="auth-workspace">...</section>
      <section class="auth-preference-region" data-ui-node="region" data-ui-id="auth-preference-region" data-parent-id="auth-workspace">
        <label><input id="loginRemember" type="checkbox">Nhớ tên đăng nhập</label>
      </section>
      <section class="auth-status-region" data-ui-node="region" data-ui-id="auth-status-region" data-parent-id="auth-workspace">
        <div class="login-error" id="loginError" hidden></div>
      </section>
      <section class="auth-action-region" data-ui-node="region" data-ui-id="auth-action-region" data-parent-id="auth-workspace">
        <button class="login-submit" id="loginSubmit" type="submit">Đăng nhập →</button>
      </section>
    </div>
  </form>
</section>

<section class="app-shell" id="appShell" hidden data-root-id="app" data-ui-node="root">
  <nav class="app-nav" id="appNav" data-ui-node="navigation" data-ui-id="app-navigation" data-parent-id="app-root"></nav>
  <main class="screen-host" id="screenHost" data-ui-node="screen-host" data-ui-id="app-screen-host" data-parent-id="app-root"></main>
  <section class="system-layer" data-ui-node="system-layer" data-ui-id="app-system-layer" data-parent-id="app-root">
    <div class="system-toast" id="systemToast" hidden></div>
  </section>
</section>
```

`auth-card-surface` is a visual grouping container only; do not give it a fake Region ID.

- [ ] **Step 4: Update `shell.css` names/geometry without visual redesign**

Map old geometry:

```text
.login-wrap            -> .auth-workspace
.login-brand           -> .auth-brand-region
.login-card            -> .auth-card-surface
.login-remember        -> .auth-preference-region label
```

Keep the same max-width, logo size, card radius, input geometry and colors. `.system-layer` must not occupy layout space:

```css
.system-layer{position:fixed;inset:0;pointer-events:none;z-index:500}
.system-layer .system-toast{pointer-events:auto}
```

- [ ] **Step 5: Run Auth + full tests**

```bash
node --test tests/auth-structure-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 6: Static safety check that password is still never stored by the remember checkbox**

Run:

```bash
grep -n "loginRemember\|usernameStorageKey\|loginPassword" src/app.js src/core/auth.js
```

Expected: `loginRemember` controls only `CONFIG.usernameStorageKey`; no new `localStorage.setItem(...password...)` appears.

- [ ] **Step 7: Commit**

```bash
git add index.html src/styles/shell.css tests/auth-structure-contract.test.js
git commit -m "refactor: normalize TAPHOA auth and app roots"
```

---

### Task 4: Restructure Sales into Semantic Surfaces and Slot Placement

**Files:**
- Modify: `src/screens/sales.js`
- Modify: `src/styles/sales.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Modify: `tests/scroll-owner-contract.test.js`
- Create: `tests/sales-structure-contract.test.js`

**Interfaces:**
- Consumes: `SCREEN_STRUCTURE_CONTRACTS.sales`, `auditMarkupStructure()`.
- Produces: Sales Primary Surface in Slot 1; Cart Surface mobile Slot 1 / wide Slot 2; list-level scroll owners.
- Existing pure business helpers remain API-compatible: `filterProducts`, `cartTotals`, `buildOrderDraft`, `salesMarkup`, `mount`.

- [ ] **Step 1: Write failing Sales structure test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {salesMarkup} from '../src/screens/sales.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const html=salesMarkup({products:[{id:'p1',ten:'SP 1',gia:125,nhom:'N1'}],customers:[]});

test('Sales markup matches Semantic Tree and Slot contract',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.sales);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('Sales primary source order is context -> controls -> product list',()=>{
  const ids=['sales-context-region','sales-product-controls','sales-product-list'];
  const positions=ids.map(id=>html.indexOf(`data-ui-id="${id}"`));
  assert.ok(positions.every(x=>x>=0));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
});

test('Sales cart is a semantic Surface, not a modal navigation overlay',()=>{
  assert.match(html,/data-ui-id="sales-cart-surface"/);
  assert.doesNotMatch(html,/sales-cart-backdrop/);
});
```

- [ ] **Step 2: Run Sales structure test and verify RED**

```bash
node --test tests/sales-structure-contract.test.js
```

Expected: FAIL on missing workspace/surface/region markers and old cart overlay.

- [ ] **Step 3: Refactor `salesMarkup()` only at the structural layer**

Target semantic skeleton:

```html
<section class="sales-screen" data-screen-id="sales" data-root-id="sales" data-active-surface="products">
  <div class="sales-workspace" data-ui-node="workspace" data-ui-id="sales-workspace" data-parent-id="sales-root">
    <section class="sales-primary-surface" data-ui-node="surface" data-ui-id="sales-primary-surface" data-parent-id="sales-workspace" data-slot-mobile="1" data-slot-wide="1">
      <header class="sales-context-region" data-ui-node="region" data-ui-id="sales-context-region" data-parent-id="sales-primary-surface">...</header>
      <section class="sales-product-controls" data-ui-node="region" data-ui-id="sales-product-controls" data-parent-id="sales-primary-surface">...</section>
      <section class="sales-product-list-region" data-ui-node="region" data-ui-id="sales-product-list" data-parent-id="sales-primary-surface">...</section>
    </section>
    <aside class="sales-cart-surface" data-ui-node="surface" data-ui-id="sales-cart-surface" data-parent-id="sales-workspace" data-slot-mobile="1" data-slot-wide="2">
      <section class="sales-cart-list-region" data-ui-node="region" data-ui-id="sales-cart-list" data-parent-id="sales-cart-surface">...</section>
      <section class="sales-cart-total-region" data-ui-node="region" data-ui-id="sales-cart-total" data-parent-id="sales-cart-surface">...</section>
      <section class="sales-cart-actions-region" data-ui-node="region" data-ui-id="sales-cart-actions" data-parent-id="sales-cart-surface">...</section>
    </aside>
  </div>
</section>
```

Preserve existing customer/search/group/product/cart controls and business data. Root `data-active-surface` is `cart` when existing `state.cartOpen===true`, otherwise `products`.

- [ ] **Step 4: Replace overlay geometry with responsive Surface placement**

In `sales.css`:

```css
[data-screen-id="sales"] .sales-workspace{display:grid;grid-template-columns:minmax(0,1fr);min-height:0;height:100%}
[data-screen-id="sales"] .sales-primary-surface,[data-screen-id="sales"] .sales-cart-surface{min-width:0;min-height:0}

@container screen-host (max-width:1023px){
  [data-screen-id="sales"] .sales-primary-surface{display:grid}
  [data-screen-id="sales"] .sales-cart-surface{display:none}
  [data-screen-id="sales"][data-active-surface="cart"] .sales-primary-surface{display:none}
  [data-screen-id="sales"][data-active-surface="cart"] .sales-cart-surface{display:grid}
}

@container screen-host (min-width:1024px){
  [data-screen-id="sales"] .sales-workspace{grid-template-columns:minmax(0,1fr) minmax(320px,34%)}
  [data-screen-id="sales"] .sales-primary-surface{grid-column:1}
  [data-screen-id="sales"] .sales-cart-surface{grid-column:2;display:grid}
}
```

Do not create a third empty column for Slot 3.

- [ ] **Step 5: Move scroll owner selectors to semantic region IDs**

`scroll-owner.css` must own:

```css
[data-ui-id="sales-product-list"]{min-height:0;overflow:auto}
[data-ui-id="sales-cart-list"]{min-height:0;overflow:auto}
```

`src/core/scroll-owner.js` config must use:

```js
sales:['[data-ui-id="sales-product-list"]','[data-ui-id="sales-cart-list"]']
```

Update `tests/scroll-owner-contract.test.js` to expect these selectors and still verify independent `scrollTop` restore.

- [ ] **Step 6: Run Sales + price + scroll regression**

```bash
node --test tests/sales-structure-contract.test.js tests/sales-price-contract.test.js tests/scroll-owner-contract.test.js
```

Expected: PASS; literal price tests remain unchanged.

- [ ] **Step 7: Run parse + full tests**

```bash
node --check src/screens/sales.js
node --check src/core/scroll-owner.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/sales.js src/styles/sales.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/sales-structure-contract.test.js tests/scroll-owner-contract.test.js
git commit -m "refactor: normalize TAPHOA sales regions and slots"
```

---

### Task 5: Restructure Delivered into List, Detail, and Print Surfaces

**Files:**
- Modify: `src/screens/delivered.js`
- Modify: `src/styles/delivered.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Create: `tests/delivered-structure-contract.test.js`

**Interfaces:**
- Consumes: `SCREEN_STRUCTURE_CONTRACTS.delivered`.
- Produces: list Surface Slot 1; detail Surface mobile Slot 1/wide Slot 2; print Surface mobile Slot 1/wide Slot 3.
- Preserve: `quickRange`, `filterDeliveredOrders`, `summarizeDeliveredBySource`, business calls and edit navigation.

- [ ] **Step 1: Write failing Delivered structure test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredMarkup} from '../src/screens/delivered.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'D1',trangThai:'done',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125}]};
const html=deliveredMarkup({orders:[order],selected:order,printOrder:null});

test('Delivered markup matches list/detail/print Surface contract',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.delivered);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('Delivered detail is a Surface with explicit back action',()=>{
  assert.match(html,/data-ui-id="delivered-detail-surface"/);
  assert.match(html,/data-detail-close/);
  assert.doesNotMatch(html,/delivered-backdrop/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/delivered-structure-contract.test.js
```

Expected: FAIL.

- [ ] **Step 3: Rebuild markup skeleton with three Surfaces**

Use:

```text
delivered-workspace
├── delivered-list-surface
│   ├── delivered-filter-region
│   ├── delivered-summary-region
│   └── delivered-order-list
├── delivered-detail-surface
│   ├── delivered-detail-meta
│   ├── delivered-detail-lines
│   └── delivered-detail-actions
└── delivered-print-surface
    ├── delivered-print-meta
    ├── delivered-print-lines
    └── delivered-print-actions
```

Render detail/print Surface only when their state exists. Remove semantic-navigation backdrop wrappers. `data-active-surface` resolves in this order: `print` if `printOrder`, else `detail` if `selected`, else `list`.

- [ ] **Step 4: Implement mobile replace and wide parallel placement**

```css
[data-screen-id="delivered"] .delivered-workspace{display:grid;grid-template-columns:minmax(0,1fr);min-height:0;height:100%}
@container screen-host (max-width:1023px){
  [data-screen-id="delivered"] [data-ui-node="surface"]{display:none}
  [data-screen-id="delivered"][data-active-surface="list"] [data-ui-id="delivered-list-surface"],
  [data-screen-id="delivered"][data-active-surface="detail"] [data-ui-id="delivered-detail-surface"],
  [data-screen-id="delivered"][data-active-surface="print"] [data-ui-id="delivered-print-surface"]{display:grid}
}
@container screen-host (min-width:1024px){
  [data-screen-id="delivered"] .delivered-workspace{grid-template-columns:minmax(0,1fr) minmax(340px,.8fr) minmax(300px,.65fr)}
  [data-ui-id="delivered-list-surface"]{grid-column:1}
  [data-ui-id="delivered-detail-surface"]{grid-column:2}
  [data-ui-id="delivered-print-surface"]{grid-column:3}
}
```

When detail/print is absent, its column must collapse by changing the workspace template via `:has()` or root state class; do not leave an empty reserved column. Prefer root state selectors, e.g. two-column template only when detail exists and three-column only when print exists.

- [ ] **Step 5: Update scroll owners**

Use semantic selectors:

```text
[data-ui-id="delivered-order-list"]
[data-ui-id="delivered-detail-lines"]
[data-ui-id="delivered-print-lines"]
```

- [ ] **Step 6: Verify function flow preservation**

Run unit/static tests and inspect `onClick` code to confirm:

```text
order open -> selected -> detail Surface
detail close -> selected=null -> list Surface
print -> printOrder -> print Surface
print close -> printOrder=null -> list Surface
edit -> context.editOrder + route sales
```

No business endpoint names change.

- [ ] **Step 7: Run tests**

```bash
node --test tests/delivered-structure-contract.test.js tests/scroll-owner-contract.test.js
npm test
node --check src/screens/delivered.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/delivered.js src/styles/delivered.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/delivered-structure-contract.test.js
git commit -m "refactor: normalize delivered list and detail surfaces"
```

---

### Task 6: Restructure Pending into List, Source, Order, and Print Surfaces

**Files:**
- Modify: `src/screens/pending.js`
- Modify: `src/styles/pending.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Create: `tests/pending-structure-contract.test.js`

**Interfaces:**
- Consumes: `SCREEN_STRUCTURE_CONTRACTS.pending`.
- Produces: primary list Slot 1; source/order detail mobile Slot 1/wide Slot 2; print mobile Slot 1/wide Slot 3.
- Preserve: pending/deliver/edit/delete/batch-delete/print business methods and confirm behavior for destructive actions.

- [ ] **Step 1: Write failing Pending structure test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingMarkup} from '../src/screens/pending.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'P1',trangThai:'pending',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125,nhom:'N1'}]};
const html=pendingMarkup({orders:[order],selectedOrder:order});

test('Pending markup matches approved Surface tree',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.pending);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('Pending order detail has explicit back and no navigation backdrop',()=>{
  assert.match(html,/data-ui-id="pending-detail-surface"/);
  assert.match(html,/data-order-close/);
  assert.doesNotMatch(html,/pending-backdrop/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/pending-structure-contract.test.js
```

Expected: FAIL.

- [ ] **Step 3: Rebuild Pending semantic skeleton**

Use the exact contract IDs from Task 2. Root `data-active-surface` values are `list`, `source`, `detail`, `print` with precedence `print > detail > source > list`.

Keep source summary and order list in the primary Surface. Source detail and Order detail are two alternative Slot 2 Surfaces; they must never both be active. Print uses Slot 3 on wide.

- [ ] **Step 4: Implement mobile replace / wide parallel CSS without empty columns**

Use the same contract as Delivered, scoped under `[data-screen-id="pending"]`. Slot 2 appears only for `source` or `detail`; Slot 3 appears only for `print`. Mobile shows exactly one active Surface in Slot 1.

- [ ] **Step 5: Update scroll owners**

Semantic scroll selectors:

```text
[data-ui-id="pending-order-list"]
[data-ui-id="pending-source-lines"]
[data-ui-id="pending-detail-lines"]
[data-ui-id="pending-print-lines"]
```

- [ ] **Step 6: Preserve destructive/action flow exactly**

The following runtime behavior must remain:

```text
source open -> selectedSource
source back -> selectedSource=null
order open -> selectedOrder
order back -> selectedOrder=null
edit -> orderDetail -> editOrder -> sales route
deliver -> business.deliverOrder -> refresh orders,debt
delete -> confirm -> business.deletePending -> refresh orders
delete all -> confirm -> business.batchOrders('delete_pending', ids)
```

Do not move permission/business decisions into CSS/markup.

- [ ] **Step 7: Run tests**

```bash
node --test tests/pending-structure-contract.test.js tests/scroll-owner-contract.test.js
npm test
node --check src/screens/pending.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/pending.js src/styles/pending.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/pending-structure-contract.test.js
git commit -m "refactor: normalize pending order surfaces"
```

---

### Task 7: Restructure Debt into Customer, Ledger, and Order Surfaces with a 3-Level Back Path

**Files:**
- Modify: `src/screens/debt.js`
- Modify: `src/styles/debt.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Create: `tests/debt-structure-contract.test.js`

**Interfaces:**
- Consumes: `SCREEN_STRUCTURE_CONTRACTS.debt`.
- Produces: Customer List Slot 1, Ledger Slot 2 on wide / Slot 1 mobile, linked Order Slot 3 on wide / Slot 1 mobile.
- Preserve: `debtGroups`, `debtTotals`, `ledgerRows`, debt business mutations, share behavior.

- [ ] **Step 1: Write failing Debt structure/back-path test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {debtMarkup} from '../src/screens/debt.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const detail={customer:{id:'c1',ten:'KH'},soDu:125,transactions:[]};
const order={id:'D1',tenKH:'KH',tongTien:125,items:[{tenSP:'SP',sl:1,gia:125}]};
const html=debtMarkup({summary:[{maKH:'c1',ten:'KH',soDu:125}],customers:[{id:'c1',ten:'KH'}],selectedCustomerId:'c1',detail,selectedOrder:order});

test('Debt markup matches 3-Surface contract',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.debt);
  assert.equal(result.pass,true,result.errors.join('\n'));
});

test('Debt linked order is a tertiary Surface with explicit back',()=>{
  assert.match(html,/data-ui-id="debt-order-surface"/);
  assert.match(html,/data-order-close/);
  assert.doesNotMatch(html,/debt-backdrop/);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/debt-structure-contract.test.js
```

Expected: FAIL.

- [ ] **Step 3: Build the semantic hierarchy**

Target flow:

```text
Customer List Surface
  -> open customer
Ledger Surface
  -> open linked order
Order Surface
  -> back
Ledger Surface
  -> back
Customer List Surface
```

Root active surface derives:

```js
const activeSurface=state.selectedOrder?'order':state.detail?'ledger':'list';
```

Do not clear `detail` when opening linked order; it is needed for Order -> Ledger back. `data-order-close` clears only `selectedOrder`. `data-debt-close` clears `detail` and `selectedCustomerId` only when returning Ledger -> List.

- [ ] **Step 4: Replace overlay wrappers with semantic Surfaces**

Use:

```text
debt-list-surface      mobile=1 wide=1
debt-ledger-surface    mobile=1 wide=2
debt-order-surface     mobile=1 wide=3
```

Keep the current visual receipt/header/transaction/order row content inside the new Surfaces. Do not change money calculations or ledger business semantics in this structural task.

- [ ] **Step 5: Implement responsive placement**

Mobile: exactly one active Surface displayed. Wide: customer list remains Slot 1; when `detail` exists show Ledger Slot 2; when `selectedOrder` exists show Order Slot 3. No empty Slot 2/3 geometry when corresponding state is absent.

- [ ] **Step 6: Update Debt scroll owners**

Use:

```text
[data-ui-id="debt-customer-list"]
[data-ui-id="debt-ledger-list"]
[data-ui-id="debt-order-lines"]
```

Keep overscroll containment and independent scrollTop restore.

- [ ] **Step 7: Run Debt + scroll + full regression**

```bash
node --test tests/debt-structure-contract.test.js tests/scroll-owner-contract.test.js
npm test
node --check src/screens/debt.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/debt.js src/styles/debt.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/debt-structure-contract.test.js
git commit -m "refactor: normalize debt customer ledger order surfaces"
```

---

### Task 8: Add the Whole-Site Structural Audit CLI and CI Gate

**Files:**
- Create: `scripts/audit-ui-structure.mjs`
- Modify: `package.json`
- Create: `.github/workflows/ui-guardrail-check.yml`
- Remove after replacement is confirmed: `.github/workflows/scroll-owner-check.yml`

**Interfaces:**
- Consumes: `auditMarkupStructure`, root contracts, four Screen contracts, pure Screen markup exports.
- Produces: CLI exit 0 only when static TREE/NAMING/OWNER/PLACEMENT/FLOW markers pass for Auth/App/4 Screens.
- Does not claim browser/device PASS.

- [ ] **Step 1: Write the audit CLI**

Create `scripts/audit-ui-structure.mjs`:

```js
import {readFileSync} from 'node:fs';
import {auditMarkupStructure,validateStructureContract} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';
import {salesMarkup} from '../src/screens/sales.js';
import {deliveredMarkup} from '../src/screens/delivered.js';
import {pendingMarkup} from '../src/screens/pending.js';
import {debtMarkup} from '../src/screens/debt.js';

const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const samples={
  sales:salesMarkup({products:[{id:'p1',ten:'SP',gia:125,nhom:'N'}],customers:[]}),
  delivered:deliveredMarkup({orders:[]}),
  pending:pendingMarkup({orders:[]}),
  debt:debtMarkup({summary:[],customers:[]})
};

const checks=[
  ['auth',auditMarkupStructure(indexHtml,AUTH_STRUCTURE_CONTRACT)],
  ['app',auditMarkupStructure(indexHtml,APP_STRUCTURE_CONTRACT)],
  ...Object.entries(SCREEN_STRUCTURE_CONTRACTS).map(([id,contract])=>[id,auditMarkupStructure(samples[id],contract)])
];

let failed=false;
for(const [id,result] of checks){
  const state=result.pass?'PASS':'FAIL';
  console.log(`${id}: STRUCTURE STATIC ${state}`);
  for(const error of result.errors){failed=true;console.error(`  - ${error}`);}
}
for(const [id,contract] of Object.entries(SCREEN_STRUCTURE_CONTRACTS)){
  const errors=validateStructureContract(contract);
  if(errors.length){failed=true;console.error(`${id}: CONTRACT FAIL\n${errors.join('\n')}`);}
}
console.log('browser/device: NOT_RUN (static audit does not imply browser PASS)');
process.exitCode=failed?1:0;
```

- [ ] **Step 2: Add npm script**

`package.json` becomes:

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "audit:ui": "node scripts/audit-ui-structure.mjs"
  }
}
```

- [ ] **Step 3: Run audit locally**

```bash
npm run audit:ui
```

Expected output includes:

```text
auth: STRUCTURE STATIC PASS
app: STRUCTURE STATIC PASS
sales: STRUCTURE STATIC PASS
delivered: STRUCTURE STATIC PASS
pending: STRUCTURE STATIC PASS
debt: STRUCTURE STATIC PASS
browser/device: NOT_RUN (static audit does not imply browser PASS)
```

and exit code 0.

- [ ] **Step 4: Create permanent CI workflow**

`.github/workflows/ui-guardrail-check.yml`:

```yaml
name: TAPHOA UI guardrail

on:
  push:
    branches: [main, 'feat/**']
  pull_request:

jobs:
  guardrail:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
      - run: npm run audit:ui
      - name: Parse core and screens
        run: |
          node --check src/app.js
          node --check src/core/ui-structure.js
          node --check src/contracts/ui-structure.js
          node --check src/core/screen-registry.js
          node --check src/core/scroll-owner.js
          node --check src/screens/sales.js
          node --check src/screens/delivered.js
          node --check src/screens/pending.js
          node --check src/screens/debt.js
```

- [ ] **Step 5: Push/observe one green run before removing the old workflow**

Expected: `npm test`, `npm run audit:ui`, and all parse steps PASS on the exact HEAD commit.

- [ ] **Step 6: Remove the superseded branch-specific scroll workflow**

```bash
git rm .github/workflows/scroll-owner-check.yml
```

Reason: `ui-guardrail-check.yml` runs `tests/scroll-owner-contract.test.js` through `npm test` and is not limited to the old feature branch.

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-ui-structure.mjs package.json .github/workflows/ui-guardrail-check.yml .github/workflows/scroll-owner-check.yml
git commit -m "test: enforce TAPHOA UI structural guardrail"
```

---

### Task 9: Final Cross-Screen Regression and Honest Gate Report

**Files:**
- No runtime file changes unless a test exposes a defect.
- Update tests only if a discovered defect needs a regression test before its fix.

**Interfaces:**
- Consumes: all tasks above.
- Produces: exact evidence for static structure/runtime regression and a separate statement of browser/device status.

- [ ] **Step 1: Run complete test suite from a clean checkout**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 2: Run structural audit**

```bash
npm run audit:ui
```

Expected: Auth/App/4 Screen static structure PASS and explicit `browser/device: NOT_RUN` unless browser testing is actually performed.

- [ ] **Step 3: Parse every modified JS module**

```bash
node --check src/app.js
node --check src/core/ui-structure.js
node --check src/contracts/ui-structure.js
node --check src/core/screen-registry.js
node --check src/core/router.js
node --check src/core/scroll-owner.js
node --check src/screens/sales.js
node --check src/screens/delivered.js
node --check src/screens/pending.js
node --check src/screens/debt.js
```

Expected: all exit 0.

- [ ] **Step 4: Re-run protected existing behavior contracts**

```bash
node --test tests/sales-price-contract.test.js tests/app-state.test.js tests/business.test.js tests/snapshot.test.js tests/scroll-owner-contract.test.js
```

Expected: all PASS. This protects literal price, data-read state, business gateway, account snapshot isolation and scroll restoration.

- [ ] **Step 5: Perform responsive browser matrix only if a real browser/device runner is available**

Check these exact widths in both forward and reverse resize order:

```text
280 -> 320 -> 390 -> 480 -> 760 -> 761 -> 999 -> 1000 -> 1280 -> 1440
1440 -> 1280 -> 1000 -> 999 -> 761 -> 760 -> 480 -> 390 -> 320 -> 280
```

At each width verify:

```text
Auth: no overflow; form remains operable.
Sales: mobile one active Surface; wide product Slot 1 + cart Slot 2; only list regions scroll.
Delivered: mobile replace list/detail/print; wide list/detail/print only when state exists; no empty reserved columns.
Pending: mobile one active Surface; wide source/order Slot 2 and print Slot 3 only when present.
Debt: mobile back order -> ledger -> list; wide list Slot 1, ledger Slot 2, order Slot 3; no nested whole-screen scroll.
Navigation: remains App Root sibling of Screen Host, not inside Screen.
```

If no browser runner is available, do not claim `RESPONSIVE PASS` or `SCREEN STRUCTURE PASS`; report `STATIC STRUCTURE PASS / BROWSER NOT VERIFIED`.

- [ ] **Step 6: Verify exact HEAD CI**

Confirm the permanent GitHub Actions run is `completed/success` for the exact commit SHA being proposed for merge.

- [ ] **Step 7: Final commit only if Step 5 exposed a defect and a regression fix was necessary**

For each defect: add failing test -> verify RED -> minimal fix -> verify GREEN -> full suite, then commit with a focused message. Do not create an empty “final” commit.

---

## Self-Review Coverage Map

| Spec requirement | Implementation task |
|---|---|
| Single rule source / precedence | Task 1 |
| Auth Root vs App Root | Tasks 1, 3 |
| Slot 1/2/3 and no semantic-parent inference | Tasks 2, 4–7 |
| 8-question Region contract + owners | Task 2 |
| Parent–Child / no owner collision | Task 2 + per-screen markup |
| Naming / source order | Task 1, Task 2 auditor, Tasks 3–7 |
| Function Flow / Back path | Task 2 contracts, Tasks 4–7 |
| Scroll owner by long list | Tasks 4–7 + existing scroll tests |
| Login copy contradiction | Task 3 |
| One Screen Registry | Task 2 |
| Only Active Screen mount | existing `app.js` lifecycle preserved + Task 2 registry regression |
| Mobile one track / PC parallel surfaces | Tasks 4–7 |
| Static PASS != browser PASS | Tasks 1, 8, 9 |
| No backend/data/auth contract change | Global constraints + regression in Task 9 |

The plan intentionally does **not** add a new UI framework, DOM parser dependency, browser library, backend migration, new Screen, or production deployment step.