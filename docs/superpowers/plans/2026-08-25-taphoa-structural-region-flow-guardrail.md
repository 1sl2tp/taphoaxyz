# TAPHOA Structural Region & Function Flow Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến đặc tả phân vùng TAPHOA thành một guardrail có thể kiểm tra bằng code/CI, rồi chuẩn hóa Auth + 4 Screen theo cùng Semantic Tree, Slot 1/2/3, Parent–Child, owner và function-flow contract mà không đổi business/data/backend contract.

**Architecture:** `src/core/ui-structure.js` chỉ chứa validator/auditor thuần; `src/contracts/ui-structure.js` khai báo Root/Screen/Surface/Region/Flow cụ thể; DOM mang marker semantic ổn định (`data-ui-node`, `data-ui-id`, `data-parent-id`, `data-slot-mobile`, `data-slot-wide`). `src/core/screen-registry.js` là registry top-level duy nhất của 4 Screen. Slot là placement identity; Slot 2/3 không tạo cột rỗng khi Surface tương ứng không tồn tại — workspace compact các track đang active nhưng semantic slot identity không đổi.

**Tech Stack:** HTML5, CSS Container Queries, JavaScript ES modules, Node.js 22 `node:test`, GitHub Actions; không thêm runtime dependency, UI framework hoặc DOM parser library chỉ để audit static.

**Spec:** `docs/superpowers/specs/2026-08-25-taphoa-structural-region-flow-guardrail-design.md`

## Global Constraints

- TAPHOA chỉ có 4 Screen nghiệp vụ top-level: `sales`, `delivered`, `pending`, `debt`.
- Login/Auth là Root thay thế App Root, không phải Screen và không nằm trong Slot 1/2/3.
- Mobile chỉ dùng placement Slot 1; PC/Wide có thể dùng Slot 2/3 nhưng không tạo business flow thứ hai.
- Semantic parent không đổi khi responsive đổi placement.
- Slot 2/3 vắng mặt phải co geometry hoàn toàn; không dựng cột/wrapper rỗng chỉ để “dự trữ”.
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

- `src/core/ui-structure.js` — generic structure validator/auditor + gate classification.
- `src/contracts/ui-structure.js` — Auth/App/4 Screen structural + function-flow contracts.
- `src/core/screen-registry.js` — single top-level registry/nav/loader.
- `scripts/audit-ui-structure.mjs` — CLI static audit with truthful gate report.
- `tests/rules-source-contract.test.js`
- `tests/ui-structure-model.test.js`
- `tests/screen-registry.test.js`
- `tests/auth-structure-contract.test.js`
- `tests/sales-structure-contract.test.js`
- `tests/delivered-structure-contract.test.js`
- `tests/pending-structure-contract.test.js`
- `tests/debt-structure-contract.test.js`
- `.github/workflows/ui-guardrail-check.yml`

### Modify

- `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt`
- `index.html`
- `src/app.js`
- `src/core/router.js`
- `src/core/scroll-owner.js`
- `src/styles/shell.css`
- `src/styles/sales.css`
- `src/styles/delivered.css`
- `src/styles/pending.css`
- `src/styles/debt.css`
- `src/styles/scroll-owner.css`
- `src/screens/sales.js`
- `src/screens/delivered.js`
- `src/screens/pending.js`
- `src/screens/debt.js`
- `tests/scroll-owner-contract.test.js`
- `package.json`

### Remove after replacement CI is green

- `.github/workflows/scroll-owner-check.yml`

---

## Marker Contract

Root:

```html
<section data-ui-node="root" data-root-id="auth">...</section>
<section data-ui-node="root" data-root-id="app">...</section>
```

Screen root keeps `data-screen-id`:

```html
<section data-ui-node="screen" data-screen-id="sales">...</section>
```

Workspace/Surface/Region:

```html
<div data-ui-node="workspace" data-ui-id="sales-workspace" data-parent-id="sales-root">...</div>
<section data-ui-node="surface" data-ui-id="sales-primary-surface" data-parent-id="sales-workspace" data-slot-mobile="1" data-slot-wide="1">...</section>
<section data-ui-node="region" data-ui-id="sales-product-list" data-parent-id="sales-primary-surface">...</section>
```

Only Surface carries `data-slot-*`. Region inherits placement from its Surface parent.

---

### Task 1: Merge the Approved Design into the Single TAPHOA Rule Source

**Files:**
- Modify: `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt`
- Create: `tests/rules-source-contract.test.js`

**Interfaces:**
- Consumes: approved design spec.
- Produces: one operational rule source; no second rules file becomes authoritative.

- [ ] **Step 1: Write the failing rule-source test**

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

test('single TAPHOA rule source contains the approved structural guardrail',()=>{
  for(const token of required)assert.ok(rules.includes(token),`missing ${token}`);
});

test('Auth remains outside business Screen tree',()=>{
  assert.match(rules,/Login\/Auth.+không phải Screen nghiệp vụ/s);
  assert.match(rules,/Auth Root.+App Root.+thay thế nhau/s);
});

test('remember-user rule never becomes password persistence',()=>{
  assert.match(rules,/Nhớ tên đăng nhập/);
  assert.match(rules,/không lưu password|không lưu mật khẩu/i);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/rules-source-contract.test.js
```

Expected: FAIL because the current compact rule file does not contain the new approved sections.

- [ ] **Step 3: Merge rules under these exact headings**

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

The Login rule must explicitly say:

```text
Checkbox hiện chỉ lưu username/local hint phải hiển thị "Nhớ tên đăng nhập".
Không được đổi implementation sang lưu password để khớp nhãn cũ.
```

- [ ] **Step 4: Verify GREEN and full regression**

```bash
node --test tests/rules-source-contract.test.js
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/TAPHOA_QUY_TAC_LAM_VIEC.txt tests/rules-source-contract.test.js
git commit -m "docs: merge TAPHOA structural guardrail rules"
```

---

### Task 2: Build the Structural Model, Contracts, Screen Registry, and Static Auditor API

**Files:**
- Create: `src/core/ui-structure.js`
- Create: `src/contracts/ui-structure.js`
- Create: `src/core/screen-registry.js`
- Modify: `src/core/router.js`
- Modify: `src/app.js`
- Create: `tests/ui-structure-model.test.js`
- Create: `tests/screen-registry.test.js`

**Interfaces:**
- `validateStructureContract(contract) -> Array<{gate:string,message:string}>`
- `auditMarkupStructure(html, contract) -> {pass:boolean, issues:Array, gates:Record<string,boolean>}`
- `AUTH_STRUCTURE_CONTRACT`, `APP_STRUCTURE_CONTRACT`, `SCREEN_STRUCTURE_CONTRACTS`
- `SCREEN_REGISTRY`, `SCREEN_IDS`, `NAV_ITEMS`, `loadRegisteredScreen(id)`

- [ ] **Step 1: Write model tests first**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStructureContract,auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const owners={geometry:'parent',paint:'self',interaction:'probe-controller',state:'probe-controller',scroll:'none',focus:'none'};
const good={
  id:'probe',
  root:{id:'probe-root',kind:'root',attribute:'data-root-id',value:'probe',children:['probe-workspace']},
  nodes:[
    {id:'probe-workspace',kind:'workspace',parent:'probe-root',children:['probe-list'],purpose:'workspace',owners,order:1},
    {id:'probe-list',kind:'region',parent:'probe-workspace',children:[],purpose:'data list',owners:{...owners,scroll:'self'},order:1}
  ],
  flows:[{id:'probe.open',source:'probe-list',action:'open',mutationOwner:'probe-controller',targetState:'selected',targetRegion:'probe-list',back:'stay:probe'}]
};

test('complete contract is valid',()=>assert.deepEqual(validateStructureContract(good),[]));

test('missing owner is OWNER FAIL',()=>{
  const bad=structuredClone(good);delete bad.nodes[1].owners.scroll;
  const issues=validateStructureContract(bad);
  assert.ok(issues.some(x=>x.gate==='owner'&&/scroll/.test(x.message)));
});

test('unresolved parent is TREE FAIL',()=>{
  const bad=structuredClone(good);bad.nodes[1].parent='missing-parent';
  assert.ok(validateStructureContract(bad).some(x=>x.gate==='tree'));
});

test('mobile Surface outside Slot 1 is PLACEMENT FAIL',()=>{
  const bad=structuredClone(good);bad.nodes[1].kind='surface';bad.nodes[1].placement={mobile:2,wide:2};
  assert.ok(validateStructureContract(bad).some(x=>x.gate==='placement'));
});

test('all TAPHOA declared contracts validate',()=>{
  for(const contract of [AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,...Object.values(SCREEN_STRUCTURE_CONTRACTS)]){
    assert.deepEqual(validateStructureContract(contract),[],contract.id);
  }
});

test('markup audit checks markers and source order',()=>{
  const html='<section data-root-id="probe"><div data-ui-node="workspace" data-ui-id="probe-workspace" data-parent-id="probe-root"><div data-ui-node="region" data-ui-id="probe-list" data-parent-id="probe-workspace"></div></div></section>';
  const result=auditMarkupStructure(html,good);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/ui-structure-model.test.js
```

Expected: module-not-found FAIL.

- [ ] **Step 3: Implement `src/core/ui-structure.js`**

```js
export const UI_NODE_KINDS=Object.freeze(['root','navigation','screen-host','system-layer','screen','workspace','surface','region']);
export const REQUIRED_OWNER_KEYS=Object.freeze(['geometry','paint','interaction','state','scroll','focus']);
export const REQUIRED_FLOW_KEYS=Object.freeze(['id','source','action','mutationOwner','targetState','targetRegion','back']);
export const STRUCTURE_GATES=Object.freeze(['tree','naming','owner','placement','flow']);

const issue=(gate,message)=>({gate,message});
const semanticId=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const attrsFromTag=tag=>{
  const attrs={};
  for(const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g))attrs[match[1]]=match[2];
  return attrs;
};

export function validateStructureContract(contract){
  const issues=[];
  if(!contract?.id)issues.push(issue('tree','contract.id missing'));
  if(!contract?.root?.id)issues.push(issue('tree',`${contract?.id||'contract'} root.id missing`));
  if(!Array.isArray(contract?.root?.children))issues.push(issue('tree',`${contract?.id||'contract'} root.children must be explicit`));

  const nodes=Array.isArray(contract?.nodes)?contract.nodes:[];
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const known=new Set([contract?.root?.id,...byId.keys()].filter(Boolean));

  for(const child of contract?.root?.children||[]){
    const node=byId.get(child);
    if(!node)issues.push(issue('tree',`${contract.root.id} child ${child} missing`));
    else if(node.parent!==contract.root.id)issues.push(issue('tree',`${child} root parent mismatch`));
  }

  for(const node of nodes){
    if(!semanticId.test(String(node.id||'')))issues.push(issue('naming',`${node.id||'?'} must use semantic kebab-case id`));
    if(!UI_NODE_KINDS.includes(node.kind))issues.push(issue('tree',`${node.id} invalid kind ${node.kind}`));
    if(!known.has(node.parent))issues.push(issue('tree',`${node.id} unresolved parent ${node.parent}`));
    if(!Array.isArray(node.children))issues.push(issue('tree',`${node.id} children must be explicit array`));
    if(!String(node.purpose||'').trim())issues.push(issue('tree',`${node.id} purpose missing`));
    for(const key of REQUIRED_OWNER_KEYS){
      if(!String(node.owners?.[key]||'').trim())issues.push(issue('owner',`${node.id} owner ${key} missing`));
    }
    for(const child of node.children||[]){
      const childNode=byId.get(child);
      if(!childNode)issues.push(issue('tree',`${node.id} child ${child} missing`));
      else if(childNode.parent!==node.id)issues.push(issue('tree',`${node.id} child ${child} parent mismatch`));
    }
    if(node.kind==='surface'){
      if(Number(node.placement?.mobile)!==1)issues.push(issue('placement',`${node.id} mobile Surface must use Slot 1`));
      if(![1,2,3].includes(Number(node.placement?.wide)))issues.push(issue('placement',`${node.id} wide Surface must use Slot 1/2/3`));
    }
  }

  for(const flow of contract?.flows||[]){
    for(const key of REQUIRED_FLOW_KEYS){
      if(!String(flow?.[key]||'').trim())issues.push(issue('flow',`${contract.id} flow ${flow?.id||'?'} missing ${key}`));
    }
  }
  return issues;
}

export function auditMarkupStructure(html='',contract){
  const issues=[...validateStructureContract(contract)];
  const rootToken=`${contract.root.attribute}="${contract.root.value}"`;
  if(!html.includes(rootToken))issues.push(issue('tree',`${contract.id} missing root marker ${rootToken}`));
  const found=[];

  for(const node of contract.nodes||[]){
    const token=`data-ui-id="${node.id}"`,index=html.indexOf(token);
    if(index<0){issues.push(issue('tree',`${contract.id} markup missing ${node.id}`));continue;}
    const start=html.lastIndexOf('<',index),end=html.indexOf('>',index);
    const attrs=attrsFromTag(html.slice(start,end+1));
    if(attrs['data-ui-node']!==node.kind)issues.push(issue('tree',`${node.id} kind marker mismatch`));
    if(attrs['data-parent-id']!==node.parent)issues.push(issue('tree',`${node.id} parent marker mismatch`));
    if(node.kind==='surface'){
      if(Number(attrs['data-slot-mobile'])!==node.placement.mobile)issues.push(issue('placement',`${node.id} mobile slot marker mismatch`));
      if(Number(attrs['data-slot-wide'])!==node.placement.wide)issues.push(issue('placement',`${node.id} wide slot marker mismatch`));
    }
    found.push({node,index});
  }

  const groups=new Map();
  for(const item of found){const list=groups.get(item.node.parent)||[];list.push(item);groups.set(item.node.parent,list);}
  for(const list of groups.values()){
    const expected=[...list].sort((a,b)=>a.node.order-b.node.order).map(x=>x.node.id);
    const actual=[...list].sort((a,b)=>a.index-b.index).map(x=>x.node.id);
    if(expected.join('|')!==actual.join('|'))issues.push(issue('tree',`${contract.id} source order mismatch under ${list[0].node.parent}`));
  }

  const gates=Object.fromEntries(STRUCTURE_GATES.map(gate=>[gate,!issues.some(x=>x.gate===gate)]));
  return {pass:issues.length===0,issues,gates};
}
```

- [ ] **Step 4: Define exact contracts in `src/contracts/ui-structure.js`**

Use explicit `children`, `purpose`, `owners`, `order` for every node. Owner values may be `none` when responsibility truly does not exist; blank is invalid.

Node matrix:

```text
AUTH root auth-root
  auth-workspace
    auth-brand-region
    auth-credential-region
    auth-preference-region
    auth-status-region
    auth-action-region

APP root app-root
  app-navigation
  app-screen-host
  app-system-layer

SALES root sales-root
  sales-workspace
    sales-primary-surface       m1 w1
      sales-context-region
      sales-product-controls
      sales-product-list        scroll=self
    sales-cart-surface          m1 w2
      sales-cart-list           scroll=self
      sales-cart-total
      sales-cart-actions

DELIVERED root delivered-root
  delivered-workspace
    delivered-list-surface      m1 w1
      delivered-filter-region
      delivered-summary-region
      delivered-order-list      scroll=self
    delivered-detail-surface    m1 w2
      delivered-detail-meta
      delivered-detail-lines    scroll=self
      delivered-detail-actions
    delivered-print-surface     m1 w3
      delivered-print-meta
      delivered-print-lines     scroll=self
      delivered-print-actions

PENDING root pending-root
  pending-workspace
    pending-list-surface        m1 w1
      pending-summary-region
      pending-order-list        scroll=self
    pending-source-surface      m1 w2
      pending-source-meta
      pending-source-lines      scroll=self
      pending-source-actions
    pending-detail-surface      m1 w2
      pending-detail-meta
      pending-detail-lines      scroll=self
      pending-detail-actions
    pending-print-surface       m1 w3
      pending-print-meta
      pending-print-lines       scroll=self
      pending-print-actions

DEBT root debt-root
  debt-workspace
    debt-list-surface           m1 w1
      debt-summary-region
      debt-quick-action-region
      debt-customer-list        scroll=self
    debt-ledger-surface         m1 w2
      debt-ledger-meta
      debt-ledger-list          scroll=self
      debt-ledger-actions
    debt-order-surface          m1 w3
      debt-order-meta
      debt-order-lines          scroll=self
      debt-order-actions
```

Use this owner helper:

```js
const owners=({geometry='parent',paint='self',interaction='none',state='screen-controller',scroll='none',focus='none'}={})=>
  Object.freeze({geometry,paint,interaction,state,scroll,focus});
```

Interactive Auth regions use `auth-controller`/`auth-service`; Navigation uses `app-shell`; Screen interactive regions use `<screen>-controller`; input-containing regions set `focus:'self'`; list regions set `scroll:'self'`.

Required flow IDs:

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

Every flow has all seven required fields; `back` is one of `stay:<screen>`, `surface:<surface-id>`, `route:<screen-id>`.

- [ ] **Step 5: Run model tests**

```bash
node --test tests/ui-structure-model.test.js
```

Expected: PASS.

- [ ] **Step 6: Write Screen Registry tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {SCREEN_IDS,SCREEN_REGISTRY,NAV_ITEMS} from '../src/core/screen-registry.js';
import {normalizeRoute} from '../src/core/router.js';

test('registry contains exactly four approved Screens',()=>{
  assert.deepEqual(SCREEN_IDS,['sales','delivered','pending','debt']);
  assert.deepEqual(Object.keys(SCREEN_REGISTRY),SCREEN_IDS);
  assert.deepEqual(NAV_ITEMS.map(x=>x.id),SCREEN_IDS);
});

test('router accepts caller supplied Screen IDs',()=>{
  assert.equal(normalizeRoute('#debt',SCREEN_IDS),'debt');
  assert.equal(normalizeRoute('#unknown',SCREEN_IDS),'sales');
});
```

- [ ] **Step 7: Implement Screen Registry and make Router generic**

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

`src/core/router.js`:

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

Update `src/app.js` to import `SCREEN_IDS,NAV_ITEMS,loadRegisteredScreen`; delete the local screen-module map; pass `SCREEN_IDS` into Router/normalizeRoute. Do not modify auth, data sync, snapshot or business calls.

- [ ] **Step 8: Verify registry/core GREEN**

```bash
node --test tests/ui-structure-model.test.js tests/screen-registry.test.js
node --check src/core/ui-structure.js
node --check src/contracts/ui-structure.js
node --check src/core/screen-registry.js
node --check src/core/router.js
node --check src/app.js
npm test
```

Expected: PASS / exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/core/ui-structure.js src/contracts/ui-structure.js src/core/screen-registry.js src/core/router.js src/app.js tests/ui-structure-model.test.js tests/screen-registry.test.js
git commit -m "feat: add TAPHOA structural contract model"
```

---

### Task 3: Normalize Auth Root and App Root without Changing Auth Runtime

**Files:**
- Modify: `index.html`
- Modify: `src/styles/shell.css`
- Create: `tests/auth-structure-contract.test.js`

**Interfaces:**
- Consumes: Auth/App contracts + auditor.
- Produces: direct semantic children under Auth Workspace; no extra visual wrapper between semantic parent/children.

- [ ] **Step 1: Write failing Auth/App tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT} from '../src/contracts/ui-structure.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Auth Root matches semantic tree',()=>{
  const result=auditMarkupStructure(html,AUTH_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('App Root has Navigation, Screen Host and System Layer siblings',()=>{
  const result=auditMarkupStructure(html,APP_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('remember copy matches username-only persistence',()=>{
  assert.match(html,/Nhớ tên đăng nhập/);
  assert.doesNotMatch(html,/Lưu mật khẩu/);
});

test('existing runtime control IDs stay stable',()=>{
  for(const id of ['loginForm','loginUsername','loginPassword','loginEye','loginRemember','loginError','loginSubmit','loginScreen','appShell','appNav','screenHost','systemToast']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/auth-structure-contract.test.js
```

Expected: FAIL on markers/copy.

- [ ] **Step 3: Rewrite Auth DOM with direct semantic children**

```html
<section class="login-screen" id="loginScreen" data-ui-node="root" data-root-id="auth">
  <form class="auth-workspace" id="loginForm" data-ui-node="workspace" data-ui-id="auth-workspace" data-parent-id="auth-root">
    <header class="auth-brand-region" data-ui-node="region" data-ui-id="auth-brand-region" data-parent-id="auth-workspace">...</header>
    <section class="auth-credential-region auth-card-part" data-ui-node="region" data-ui-id="auth-credential-region" data-parent-id="auth-workspace">...</section>
    <section class="auth-preference-region auth-card-part" data-ui-node="region" data-ui-id="auth-preference-region" data-parent-id="auth-workspace">
      <label><input id="loginRemember" type="checkbox">Nhớ tên đăng nhập</label>
    </section>
    <section class="auth-status-region auth-card-part" data-ui-node="region" data-ui-id="auth-status-region" data-parent-id="auth-workspace">
      <div class="login-error" id="loginError" hidden></div>
    </section>
    <section class="auth-action-region auth-card-part" data-ui-node="region" data-ui-id="auth-action-region" data-parent-id="auth-workspace">
      <button class="login-submit" id="loginSubmit" type="submit">Đăng nhập →</button>
    </section>
  </form>
</section>

<section class="app-shell" id="appShell" hidden data-ui-node="root" data-root-id="app">
  <nav class="app-nav" id="appNav" data-ui-node="navigation" data-ui-id="app-navigation" data-parent-id="app-root"></nav>
  <main class="screen-host" id="screenHost" data-ui-node="screen-host" data-ui-id="app-screen-host" data-parent-id="app-root"></main>
  <section class="system-layer" data-ui-node="system-layer" data-ui-id="app-system-layer" data-parent-id="app-root">
    <div class="system-toast" id="systemToast" hidden></div>
  </section>
</section>
```

No `auth-card-surface` wrapper is allowed between Auth Workspace and its Regions.

- [ ] **Step 4: Preserve the visual card with contiguous Region paint, not a structural wrapper**

Use CSS like:

```css
.auth-workspace{width:100%;max-width:360px}
.auth-brand-region{text-align:center;color:#fff;margin-bottom:26px}
.auth-card-part{background:#fff;padding-inline:26px}
.auth-credential-region{padding-top:26px;border-radius:24px 24px 0 0}
.auth-preference-region,.auth-status-region{padding-top:0}
.auth-action-region{padding-top:0;padding-bottom:26px;border-radius:0 0 24px 24px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.system-layer{position:fixed;inset:0;pointer-events:none;z-index:500}
.system-layer .system-toast{pointer-events:auto}
```

Keep current logo/input/button geometry and existing IDs.

- [ ] **Step 5: Verify Auth runtime safety**

```bash
node --test tests/auth-structure-contract.test.js
npm test
grep -n "loginRemember\|usernameStorageKey\|loginPassword" src/app.js src/core/auth.js
```

Expected: tests PASS; remember checkbox still only controls username key; no password persistence is introduced.

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles/shell.css tests/auth-structure-contract.test.js
git commit -m "refactor: normalize TAPHOA auth and app roots"
```

---

### Task 4: Restructure Sales into Primary and Cart Surfaces

**Files:**
- Modify: `src/screens/sales.js`
- Modify: `src/styles/sales.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Modify: `tests/scroll-owner-contract.test.js`
- Create: `tests/sales-structure-contract.test.js`

**Interfaces:**
- Preserve exports: `filterProducts`, `cartTotals`, `buildOrderDraft`, `salesMarkup`, `mount`.
- Add: `salesActiveSurface(state) -> 'products'|'cart'`.
- Primary Surface: m1/w1. Cart Surface: m1/w2.

- [ ] **Step 1: Write failing Sales contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {salesMarkup,salesActiveSurface} from '../src/screens/sales.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const html=salesMarkup({products:[{id:'p1',ten:'SP 1',gia:125,nhom:'N1'}],customers:[]});

test('Sales markup matches contract',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.sales);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('Sales source order is Context -> Controls -> Product List',()=>{
  const ids=['sales-context-region','sales-product-controls','sales-product-list'];
  const p=ids.map(id=>html.indexOf(`data-ui-id="${id}"`));
  assert.ok(p.every(x=>x>=0));assert.deepEqual([...p].sort((a,b)=>a-b),p);
});

test('Cart is a Surface, not navigation overlay',()=>{
  assert.match(html,/data-ui-id="sales-cart-surface"/);
  assert.doesNotMatch(html,/sales-cart-backdrop/);
});

test('mobile active Surface derives from cartOpen only',()=>{
  assert.equal(salesActiveSurface({cartOpen:false}),'products');
  assert.equal(salesActiveSurface({cartOpen:true}),'cart');
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/sales-structure-contract.test.js
```

- [ ] **Step 3: Rebuild Sales skeleton with exact semantic IDs**

```text
sales-workspace
├── sales-primary-surface
│   ├── sales-context-region
│   ├── sales-product-controls
│   └── sales-product-list
└── sales-cart-surface
    ├── sales-cart-list
    ├── sales-cart-total
    └── sales-cart-actions
```

Keep existing customer/time/search/groups/product-row/price/qty/cart business controls. Root gets `data-active-surface="${salesActiveSurface(state)}"`. Remove mobile semantic overlay/backdrop; the close button remains a Back action inside Cart Surface.

- [ ] **Step 4: Implement responsive placement**

```css
[data-screen-id="sales"] .sales-workspace{display:grid;grid-template-columns:minmax(0,1fr);min-height:0;height:100%}
[data-screen-id="sales"] [data-ui-node="surface"]{min-width:0;min-height:0}

@container screen-host (max-width:1023px){
  [data-screen-id="sales"] [data-ui-node="surface"]{display:none}
  [data-screen-id="sales"][data-active-surface="products"] [data-ui-id="sales-primary-surface"],
  [data-screen-id="sales"][data-active-surface="cart"] [data-ui-id="sales-cart-surface"]{display:grid}
}

@container screen-host (min-width:1024px){
  [data-screen-id="sales"] .sales-workspace{grid-template-columns:minmax(0,1fr) minmax(320px,34%)}
  [data-ui-id="sales-primary-surface"]{grid-column:1;display:grid}
  [data-ui-id="sales-cart-surface"]{grid-column:2;display:grid}
}
```

Do not create Slot 3 DOM/column for Sales.

- [ ] **Step 5: Move scroll ownership to semantic list Regions**

```css
[data-ui-id="sales-product-list"]{min-height:0;overflow:auto}
[data-ui-id="sales-cart-list"]{min-height:0;overflow:auto}
```

`src/core/scroll-owner.js` screen config:

```js
sales:['[data-ui-id="sales-product-list"]','[data-ui-id="sales-cart-list"]']
```

Update scroll tests to use these selectors while retaining independent `scrollTop` restore assertions.

- [ ] **Step 6: Run protected regressions**

```bash
node --test tests/sales-structure-contract.test.js tests/sales-price-contract.test.js tests/scroll-owner-contract.test.js
node --check src/screens/sales.js
node --check src/core/scroll-owner.js
npm test
```

Expected: PASS; literal price behavior remains unchanged.

- [ ] **Step 7: Commit**

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
- Preserve exports/business helpers.
- Add: `deliveredActiveSurface(state) -> 'list'|'detail'|'print'`.
- List m1/w1; Detail m1/w2; Print m1/w3.

- [ ] **Step 1: Write RED contract tests using a full-state sample so all conditional Surfaces are auditable**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredMarkup,deliveredActiveSurface} from '../src/screens/delivered.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'D1',trangThai:'done',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125}]};
const html=deliveredMarkup({orders:[order],selected:order,printOrder:order});

test('Delivered full-state markup contains every declared Surface',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.delivered);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('active Surface priority is print > detail > list',()=>{
  assert.equal(deliveredActiveSurface({selected:null,printOrder:null}),'list');
  assert.equal(deliveredActiveSurface({selected:order,printOrder:null}),'detail');
  assert.equal(deliveredActiveSurface({selected:order,printOrder:order}),'print');
});

test('detail is not a navigation backdrop modal',()=>{
  assert.match(html,/data-ui-id="delivered-detail-surface"/);
  assert.doesNotMatch(html,/delivered-backdrop/);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/delivered-structure-contract.test.js
```

- [ ] **Step 3: Rebuild exact hierarchy**

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

Only render Detail/Print when state exists in normal runtime. The test passes both states only to audit every conditional node. Detail Close remains the Back action. Keep current filter/edit/print/reverse business calls unchanged.

- [ ] **Step 4: Add explicit root flags and compact wide tracks**

Markup root carries:

```html
data-active-surface="list|detail|print"
data-has-secondary="true|false"
data-has-tertiary="true|false"
```

Where `has-secondary=Boolean(selected)` and `has-tertiary=Boolean(printOrder)`.

Wide CSS:

```css
@container screen-host (min-width:1024px){
  [data-screen-id="delivered"] .delivered-workspace{display:grid;grid-template-columns:minmax(0,1fr)}
  [data-screen-id="delivered"][data-has-secondary="true"][data-has-tertiary="false"] .delivered-workspace{grid-template-columns:minmax(0,1fr) minmax(340px,.8fr)}
  [data-screen-id="delivered"][data-has-secondary="false"][data-has-tertiary="true"] .delivered-workspace{grid-template-columns:minmax(0,1fr) minmax(300px,.65fr)}
  [data-screen-id="delivered"][data-has-secondary="true"][data-has-tertiary="true"] .delivered-workspace{grid-template-columns:minmax(0,1fr) minmax(340px,.8fr) minmax(300px,.65fr)}
  [data-ui-id="delivered-list-surface"]{grid-column:1}
  [data-has-secondary="true"] [data-ui-id="delivered-detail-surface"]{grid-column:2}
  [data-has-secondary="true"][data-has-tertiary="true"] [data-ui-id="delivered-print-surface"]{grid-column:3}
  [data-has-secondary="false"][data-has-tertiary="true"] [data-ui-id="delivered-print-surface"]{grid-column:2}
}
```

Mobile displays only `data-active-surface` in the one track.

- [ ] **Step 5: Update semantic scroll selectors**

```text
[data-ui-id="delivered-order-list"]
[data-ui-id="delivered-detail-lines"]
[data-ui-id="delivered-print-lines"]
```

- [ ] **Step 6: Verify runtime flow and tests**

```text
order open -> selected -> detail
detail back -> selected=null -> list
print -> printOrder -> print
print back -> printOrder=null -> list
edit -> editOrder + route sales
```

Run:

```bash
node --test tests/delivered-structure-contract.test.js tests/scroll-owner-contract.test.js
node --check src/screens/delivered.js
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

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
- Add: `pendingActiveSurface(state) -> 'list'|'source'|'detail'|'print'`.
- List m1/w1; Source m1/w2; Detail m1/w2; Print m1/w3.
- Keep destructive confirm/business methods unchanged.

- [ ] **Step 1: Write RED tests with full conditional state**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingMarkup,pendingActiveSurface} from '../src/screens/pending.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'P1',trangThai:'pending',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125,nhom:'N1'}]};
const printData={title:'IN',date:'25/08/2026',rows:[{name:'SP',qty:1}]};
const html=pendingMarkup({orders:[order],selectedSource:'N1',selectedOrder:order,printData});

test('Pending full-state markup contains declared Surfaces',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.pending);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('active Surface priority is print > detail > source > list',()=>{
  assert.equal(pendingActiveSurface({}),'list');
  assert.equal(pendingActiveSurface({selectedSource:'N1'}),'source');
  assert.equal(pendingActiveSurface({selectedSource:'N1',selectedOrder:order}),'detail');
  assert.equal(pendingActiveSurface({selectedSource:'N1',selectedOrder:order,printData}),'print');
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/pending-structure-contract.test.js
```

- [ ] **Step 3: Rebuild exact hierarchy**

```text
pending-workspace
├── pending-list-surface
│   ├── pending-summary-region
│   └── pending-order-list
├── pending-source-surface
│   ├── pending-source-meta
│   ├── pending-source-lines
│   └── pending-source-actions
├── pending-detail-surface
│   ├── pending-detail-meta
│   ├── pending-detail-lines
│   └── pending-detail-actions
└── pending-print-surface
    ├── pending-print-meta
    ├── pending-print-lines
    └── pending-print-actions
```

Normal runtime keeps Source and Detail mutually exclusive. Full-state test only exists to audit all conditional nodes.

- [ ] **Step 4: Implement placement flags**

Root flags:

```js
const hasSecondary=Boolean(state.selectedSource||state.selectedOrder);
const hasTertiary=Boolean(state.printData);
```

On wide, one active Slot-2 Surface occupies second visible track; print occupies third when Slot 2 also exists, otherwise second visible track while retaining `data-slot-wide="3"`. On mobile, only `pendingActiveSurface(state)` displays in the single track. No empty columns.

Use the same explicit four wide grid-template cases as Task 5, scoped to Pending.

- [ ] **Step 5: Update scroll owner selectors**

```text
[data-ui-id="pending-order-list"]
[data-ui-id="pending-source-lines"]
[data-ui-id="pending-detail-lines"]
[data-ui-id="pending-print-lines"]
```

- [ ] **Step 6: Preserve exact function flow**

```text
source open -> selectedSource
source back -> selectedSource=null
order open -> selectedOrder
order back -> selectedOrder=null
edit -> orderDetail -> editOrder -> sales
deliver -> business.deliverOrder -> refresh orders,debt
delete -> confirm -> business.deletePending
delete all -> confirm -> business.batchOrders('delete_pending', ids)
```

- [ ] **Step 7: Verify tests**

```bash
node --test tests/pending-structure-contract.test.js tests/scroll-owner-contract.test.js
node --check src/screens/pending.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/pending.js src/styles/pending.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/pending-structure-contract.test.js
git commit -m "refactor: normalize pending order surfaces"
```

---

### Task 7: Restructure Debt into Customer, Ledger, and Order Surfaces

**Files:**
- Modify: `src/screens/debt.js`
- Modify: `src/styles/debt.css`
- Modify: `src/styles/scroll-owner.css`
- Modify: `src/core/scroll-owner.js`
- Create: `tests/debt-structure-contract.test.js`

**Interfaces:**
- Add: `debtActiveSurface(state) -> 'list'|'ledger'|'order'`.
- Customer m1/w1; Ledger m1/w2; Order m1/w3.
- Preserve all debt calculations/business mutations/share utility.

- [ ] **Step 1: Write RED tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {debtMarkup,debtActiveSurface} from '../src/screens/debt.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const detail={customer:{id:'c1',ten:'KH'},soDu:125,transactions:[]};
const order={id:'D1',tenKH:'KH',tongTien:125,items:[{tenSP:'SP',sl:1,gia:125}]};
const html=debtMarkup({summary:[{maKH:'c1',ten:'KH',soDu:125}],customers:[{id:'c1',ten:'KH'}],selectedCustomerId:'c1',detail,selectedOrder:order});

test('Debt full-state markup contains all three Surfaces',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.debt);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('active Surface is order > ledger > list',()=>{
  assert.equal(debtActiveSurface({}),'list');
  assert.equal(debtActiveSurface({detail}),'ledger');
  assert.equal(debtActiveSurface({detail,selectedOrder:order}),'order');
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/debt-structure-contract.test.js
```

- [ ] **Step 3: Build the 3-level semantic flow**

```text
Customer List Surface
  -> open customer
Ledger Surface
  -> open linked order
Order Surface
  -> back clears selectedOrder only
Ledger Surface
  -> back clears detail + selectedCustomerId
Customer List Surface
```

Do not clear `detail` when opening linked order; Order -> Ledger requires it.

- [ ] **Step 4: Replace navigation overlay wrappers with Surfaces**

```text
debt-workspace
├── debt-list-surface
│   ├── debt-summary-region
│   ├── debt-quick-action-region
│   └── debt-customer-list
├── debt-ledger-surface
│   ├── debt-ledger-meta
│   ├── debt-ledger-list
│   └── debt-ledger-actions
└── debt-order-surface
    ├── debt-order-meta
    ├── debt-order-lines
    └── debt-order-actions
```

Keep current receipt/transaction/order row content. Do not change balance calculation/copy/business semantics as part of this structural task.

- [ ] **Step 5: Implement exact wide state geometry**

Root flags:

```js
const hasLedger=Boolean(state.detail);
const hasOrder=Boolean(state.selectedOrder);
```

Wide CSS states:

```css
[data-screen-id="debt"] .debt-workspace{grid-template-columns:minmax(0,1fr)}
[data-screen-id="debt"][data-has-ledger="true"][data-has-order="false"] .debt-workspace{grid-template-columns:minmax(0,1fr) minmax(340px,.85fr)}
[data-screen-id="debt"][data-has-ledger="true"][data-has-order="true"] .debt-workspace{grid-template-columns:minmax(0,1fr) minmax(340px,.85fr) minmax(320px,.75fr)}
```

Order without Ledger is invalid flow; structural test should never produce it in normal state. Mobile displays exactly the one active Surface.

- [ ] **Step 6: Update scroll owners**

```text
[data-ui-id="debt-customer-list"]
[data-ui-id="debt-ledger-list"]
[data-ui-id="debt-order-lines"]
```

- [ ] **Step 7: Verify Debt regression**

```bash
node --test tests/debt-structure-contract.test.js tests/scroll-owner-contract.test.js
node --check src/screens/debt.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/debt.js src/styles/debt.css src/styles/scroll-owner.css src/core/scroll-owner.js tests/debt-structure-contract.test.js
git commit -m "refactor: normalize debt customer ledger order surfaces"
```

---

### Task 8: Add Whole-Site Audit CLI, Permanent CI, and Final Gate Report

**Files:**
- Create: `scripts/audit-ui-structure.mjs`
- Modify: `package.json`
- Create: `.github/workflows/ui-guardrail-check.yml`
- Remove after new CI succeeds: `.github/workflows/scroll-owner-check.yml`

**Interfaces:**
- Static CLI proves declared Root/Screen tree, naming, owner, placement and flow metadata.
- Existing unit tests prove protected data/business/scroll behavior.
- Browser/device status remains separate.

- [ ] **Step 1: Create audit CLI using full-state samples for conditional Surfaces**

```js
import {readFileSync} from 'node:fs';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';
import {salesMarkup} from '../src/screens/sales.js';
import {deliveredMarkup} from '../src/screens/delivered.js';
import {pendingMarkup} from '../src/screens/pending.js';
import {debtMarkup} from '../src/screens/debt.js';

const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const done={id:'D1',trangThai:'done',tenKH:'KH',ngay:'2026-08-25T12:00:00',tongTien:125,items:[{tenSP:'SP',sl:1,gia:125,nhom:'N1'}]};
const pending={id:'P1',trangThai:'pending',tenKH:'KH',ngay:'2026-08-25T12:00:00',tongTien:125,items:[{tenSP:'SP',sl:1,gia:125,nhom:'N1'}]};
const printData={title:'IN',date:'25/08/2026',rows:[{name:'SP',qty:1}]};
const debtDetail={customer:{id:'c1',ten:'KH'},soDu:125,transactions:[]};

const samples={
  sales:salesMarkup({products:[{id:'p1',ten:'SP',gia:125,nhom:'N1'}],customers:[],cartOpen:true}),
  delivered:deliveredMarkup({orders:[done],selected:done,printOrder:done}),
  pending:pendingMarkup({orders:[pending],selectedSource:'N1',selectedOrder:pending,printData}),
  debt:debtMarkup({summary:[{maKH:'c1',ten:'KH',soDu:125}],customers:[{id:'c1',ten:'KH'}],selectedCustomerId:'c1',detail:debtDetail,selectedOrder:done})
};

const checks=[
  ['auth',auditMarkupStructure(indexHtml,AUTH_STRUCTURE_CONTRACT)],
  ['app',auditMarkupStructure(indexHtml,APP_STRUCTURE_CONTRACT)],
  ...Object.entries(SCREEN_STRUCTURE_CONTRACTS).map(([id,contract])=>[id,auditMarkupStructure(samples[id],contract)])
];

let failed=false;
for(const [id,result] of checks){
  console.log(`${id}: ${result.pass?'STATIC STRUCTURE PASS':'STATIC STRUCTURE FAIL'}`);
  for(const [gate,pass] of Object.entries(result.gates))console.log(`  ${gate.toUpperCase()}: ${pass?'PASS':'FAIL'}`);
  for(const item of result.issues){failed=true;console.error(`  - [${item.gate}] ${item.message}`);}
}
console.log('BROWSER/DEVICE: NOT_RUN');
process.exitCode=failed?1:0;
```

- [ ] **Step 2: Add npm audit script**

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

- [ ] **Step 3: Run static audit**

```bash
npm run audit:ui
```

Expected: Auth, App, Sales, Delivered, Pending, Debt each print `STATIC STRUCTURE PASS`; TREE/NAMING/OWNER/PLACEMENT/FLOW gates PASS; final line remains `BROWSER/DEVICE: NOT_RUN`.

- [ ] **Step 4: Add permanent CI workflow**

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
          node --check src/core/router.js
          node --check src/core/scroll-owner.js
          node --check src/screens/sales.js
          node --check src/screens/delivered.js
          node --check src/screens/pending.js
          node --check src/screens/debt.js
```

- [ ] **Step 5: Verify protected behavior contracts**

```bash
node --test tests/sales-price-contract.test.js tests/app-state.test.js tests/business.test.js tests/snapshot.test.js tests/scroll-owner-contract.test.js
```

Expected: PASS; literal price, data-read state, business gateway, snapshot isolation and scroll restore remain protected.

- [ ] **Step 6: Push/observe one green `ui-guardrail-check.yml` run on exact HEAD**

Expected: workflow `completed/success` and head SHA equals the proposed merge SHA.

- [ ] **Step 7: Remove old branch-only workflow and re-run CI**

```bash
git rm .github/workflows/scroll-owner-check.yml
git add scripts/audit-ui-structure.mjs package.json .github/workflows/ui-guardrail-check.yml .github/workflows/scroll-owner-check.yml
git commit -m "test: enforce TAPHOA UI structural guardrail"
```

Push and verify the new workflow remains green after removal.

- [ ] **Step 8: Responsive/browser matrix — only if a real browser/device runner is available**

Test both directions:

```text
280 -> 320 -> 390 -> 480 -> 760 -> 761 -> 999 -> 1000 -> 1280 -> 1440
1440 -> 1280 -> 1000 -> 999 -> 761 -> 760 -> 480 -> 390 -> 320 -> 280
```

Verify:

```text
Auth: no overflow, fields/actions usable.
Sales: mobile one Surface; wide Primary Slot 1 + Cart Slot 2; only lists scroll.
Delivered: mobile replace list/detail/print; wide active Slot 2/3 compacts with no empty tracks.
Pending: mobile one Surface; wide Source/Detail Slot 2 and Print Slot 3 compact correctly.
Debt: mobile Back order -> ledger -> list; wide List Slot 1 + Ledger Slot 2 + Order Slot 3 when state exists.
Navigation stays sibling of Screen Host.
```

If browser runner is unavailable, final report must be exactly in meaning: `STATIC STRUCTURE PASS / BROWSER NOT VERIFIED`; do not claim Responsive or full Screen Structure PASS.

---

## Self-Review Coverage Map

| Spec requirement | Task |
|---|---|
| Single rules source / precedence | 1 |
| Auth Root vs App Root | 1, 3 |
| Slot 1/2/3 / no empty reserved geometry | 2, 4–7 |
| Semantic Tree separate from Placement Tree | 1, 2, 4–7 |
| Region Name/Parent/Children/Purpose/owners | 2 |
| Parent–Child source order | 2 + per-Screen tests |
| Naming contract | 1, 2 |
| Function flow + Back path | 2, 4–7 |
| List Scroll Owner | 4–7 + existing scroll tests |
| Login copy contradiction | 3 |
| One Screen Registry | 2 |
| Only Active Screen mount | existing lifecycle preserved + registry regression |
| Mobile one track / PC parallel Surfaces | 4–7 |
| Static PASS != browser PASS | 1, 8 |
| No business/data/auth contract change | Global Constraints + Task 8 protected regressions |

The plan intentionally does **not** add a UI framework, browser dependency, backend migration, new Screen, new business flow or production deployment step.