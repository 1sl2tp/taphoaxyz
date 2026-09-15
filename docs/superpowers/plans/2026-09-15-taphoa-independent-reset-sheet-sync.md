# TAPHOA Independent Reset + Sheet Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `taphoa.xyz` the only Tạp hóa application, authenticate with the shared V21 account system, rebuild products one-way from the management Google Sheet, start new TAPHOA order/debt state from zero, and preserve shared Chat/account data.

**Architecture:** `taphoa.xyz` switches to Supabase project `gcnoahqsrquxkwkjbuxy` and uses namespaced `taphoa_*` tables/RPCs. Shared `v21_accounts` is read-only identity/customer upstream; TAPHOA owns only `taphoa_*` business state. Product sync is one-way `Google management Sheet -> taphoa-sheet-sync -> taphoa_products`, with revision-driven frontend refresh. GETLINK decommission is explicitly a separate plan after this cutover is green.

**Tech Stack:** Supabase Postgres 17, Supabase Auth/RPC/Edge Functions, Deno Edge Runtime, Google Sheets/Drive APIs, vanilla ES modules, Node.js built-in test runner, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-15-taphoa-independent-reset-sheet-sync-design.md`

## Global Constraints

- Shared identity owner is `public.v21_accounts` in Supabase project `gcnoahqsrquxkwkjbuxy`.
- TAPHOA access mapping is exact: Admin => TAPHOA Admin; User + `contact_group='customer'` => TAPHOA customer; User + `friend|other` => denied.
- Never delete or rewrite `auth.users`, `v21_accounts`, V21 auth/session/device state, Chat messages/media/calls/Zalo state, avatars, or `contact_group`.
- New business tables and RPCs are namespaced `taphoa_*`; do not add generic `app_*` functions to the shared project.
- Google Sheet sync is one-way and reads only management file `1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU`; it never writes to Sheets and never writes GETLINK tables.
- No destructive reset runs until a complete Sheet import into `taphoa_products` has succeeded and been verified.
- The old generic TAPHOA tables are intentionally reset, not migrated.
- Snapshot cache version must change before old business rows are removed so retired rows cannot return from local cache.
- GETLINK cleanup is out of this implementation plan and begins only after this plan is fully green.

---

### Task 1: Lock the shared-account access contract and new TAPHOA schema

**Files:**
- Create: `supabase/migrations/20260915010000_taphoa_independent_core.sql`
- Create: `tests/taphoa-migration-contract.test.js`

**Interfaces:**
- Consumes: existing shared `public.v21_accounts(id,auth_user_id,username,display_name,role,contact_group,deleted_at,locked_at)`.
- Produces: `taphoa_access_context()`, `taphoa_sources`, `taphoa_products`, `taphoa_orders`, `taphoa_order_items`, `taphoa_debt_ledger`, `taphoa_revisions`, `taphoa_sheet_sync_state`, plus helper functions used by later RPCs.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/taphoa-migration-contract.test.js` with assertions that the migration text contains the required names and never contains destructive shared-account statements:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915010000_taphoa_independent_core.sql',import.meta.url),'utf8');

test('TAPHOA core is namespaced and reads shared accounts',()=>{
  for(const name of [
    'taphoa_access_context','taphoa_sources','taphoa_products','taphoa_orders',
    'taphoa_order_items','taphoa_debt_ledger','taphoa_revisions','taphoa_sheet_sync_state'
  ]) assert.match(sql,new RegExp(`\\b${name}\\b`));
  assert.match(sql,/from\s+public\.v21_accounts/i);
  assert.match(sql,/contact_group\s*=\s*'customer'/i);
});

test('migration cannot destroy shared identity/chat',()=>{
  assert.doesNotMatch(sql,/truncate[^;]*(v21_accounts|auth\.users)/i);
  assert.doesNotMatch(sql,/delete\s+from\s+(public\.)?v21_accounts/i);
  assert.doesNotMatch(sql,/drop\s+schema\s+public/i);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/taphoa-migration-contract.test.js
```

Expected: FAIL because `20260915010000_taphoa_independent_core.sql` does not exist.

- [ ] **Step 3: Implement the minimal core migration**

The migration must create the exact tables from the approved spec, seed the five source rows and five revision rows, enable RLS, and revoke direct anonymous writes. The access function must be `SECURITY DEFINER` with a pinned `search_path` and return only the current authenticated V21 account:

```sql
create or replace function public.taphoa_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare a public.v21_accounts;
declare allowed boolean := false;
declare taphoa_role text := null;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed',false);
  end if;

  select * into a
  from public.v21_accounts
  where auth_user_id=auth.uid()
    and deleted_at is null
    and locked_at is null
  limit 1;

  if not found then return jsonb_build_object('allowed',false); end if;

  if a.role='admin' then
    allowed := true; taphoa_role := 'admin';
  elsif a.role='user' and a.contact_group='customer' then
    allowed := true; taphoa_role := 'customer';
  end if;

  return jsonb_build_object(
    'account_id',a.id,
    'username',a.username,
    'display_name',a.display_name,
    'role',a.role,
    'contact_group',a.contact_group,
    'taphoa_role',taphoa_role,
    'allowed',allowed
  );
end;
$$;
```

Create `taphoa_products.product_code text primary key`; orders and debt must reference `v21_accounts(id)` rather than a copied customer table. Seed revisions exactly for `products/customers/orders/debt/settings` at `0`.

- [ ] **Step 4: Run GREEN and full unit suite**

```bash
node --test tests/taphoa-migration-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Apply the migration to shared Supabase and verify schema only**

Apply the migration with Supabase migration tooling, then run these read-only checks:

```sql
select to_regclass('public.taphoa_products') as products,
       to_regclass('public.taphoa_orders') as orders,
       to_regclass('public.taphoa_debt_ledger') as debt;

select domain,revision from public.taphoa_revisions order by domain;

select count(*) from public.v21_accounts where deleted_at is null;
```

Expected: new tables exist, all five revisions are `0`, and the shared-account count is unchanged from the captured pre-migration baseline.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260915010000_taphoa_independent_core.sql tests/taphoa-migration-contract.test.js
git commit -m "feat: add independent TAPHOA business schema"
```

---

### Task 2: Add namespaced read RPCs and frontend-shaped mapping

**Files:**
- Create: `supabase/migrations/20260915020000_taphoa_read_rpcs.sql`
- Create: `tests/taphoa-read-rpc-contract.test.js`
- Modify: `tests/app-state.test.js`

**Interfaces:**
- Consumes: Task 1 tables + `taphoa_access_context()`.
- Produces: `taphoa_app_bootstrap()`, `taphoa_app_meta()`, `taphoa_app_domains(text[])`, `taphoa_order_detail(uuid)`, `taphoa_debt_ledger_page(...)` returning current frontend field shapes.

- [ ] **Step 1: Write RED tests for RPC names, customer derivation and self-scope**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915020000_taphoa_read_rpcs.sql',import.meta.url),'utf8');

test('read RPCs are TAPHOA namespaced',()=>{
  for(const name of ['taphoa_app_bootstrap','taphoa_app_meta','taphoa_app_domains','taphoa_order_detail','taphoa_debt_ledger_page'])
    assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}`,'i'));
});

test('customers come from V21 customer group',()=>{
  assert.match(sql,/from\s+public\.v21_accounts/i);
  assert.match(sql,/contact_group\s*=\s*'customer'/i);
  assert.doesNotMatch(sql,/from\s+public\.accounts/i);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/taphoa-read-rpc-contract.test.js
```

Expected: FAIL because migration file does not exist.

- [ ] **Step 3: Implement read RPCs with one authorization helper**

Use `taphoa_access_context()` at the top of every public read RPC. Product JSON must preserve the frontend contract:

```sql
jsonb_build_object(
  'maSP',p.product_code,
  'ten',p.product_name,
  'gia',coalesce(p.carton_price_vnd,p.sale_price_vnd,0) / 1000.0,
  'von',coalesce(p.input_price_vnd,0) / 1000.0,
  'nhom',p.source_key,
  'donVi',case when p.input_price_basis='retail' then coalesce(nullif(p.retail_unit,''),'lẻ') else 'thùng' end,
  'donViLe',p.retail_unit,
  'quyCach',p.units_per_carton,
  'quyDoiThung',p.units_per_carton,
  'giaLe',coalesce(p.retail_price_vnd,0) / 1000.0,
  'active',p.is_active
)
```

Customer JSON must map `maKH=v21_accounts.id`, `ten=display_name`, `username=username`. Admin receives all active customer-group users; customer receives only self. Orders/debt must enforce the same scope before returning rows.

- [ ] **Step 4: Run tests**

```bash
node --test tests/taphoa-read-rpc-contract.test.js tests/app-state.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Apply migration and smoke RPC permissions with authenticated sessions**

Verify these outcomes using an Admin session and representative user sessions:

```text
Admin -> taphoa_access_context.allowed=true, taphoa_role=admin
User/customer -> allowed=true, taphoa_role=customer
User/friend -> allowed=false
User/other -> allowed=false
```

Also verify `taphoa_app_bootstrap()` returns empty orders/debt from the new namespace and customer count equals current active `user/customer` population.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260915020000_taphoa_read_rpcs.sql tests/taphoa-read-rpc-contract.test.js tests/app-state.test.js
git commit -m "feat: add TAPHOA read RPC boundary"
```

---

### Task 3: Add namespaced order/debt mutation RPCs with idempotency

**Files:**
- Create: `supabase/migrations/20260915030000_taphoa_mutation_rpcs.sql`
- Create: `tests/taphoa-mutation-rpc-contract.test.js`
- Modify: `tests/business.test.js`

**Interfaces:**
- Consumes: Task 1 schema + Task 2 access rules.
- Produces: `taphoa_save_order`, `taphoa_deliver_order`, `taphoa_reverse_order`, `taphoa_delete_pending_order`, `taphoa_batch_orders`, `taphoa_debt_transaction`.

- [ ] **Step 1: Write RED tests**

Extend `tests/business.test.js` so frontend service expectations use TAPHOA namespaced RPCs:

```js
test('bootstrap routes to taphoa_app_bootstrap',async()=>{
  const {service,calls}=fakeService();
  await service.bootstrap();
  assert.deepEqual(calls,[['taphoa_app_bootstrap',{}]]);
});
```

Create static SQL assertions that every mutation RPC checks Admin authorization and that delivery/reversal/debt changes bump the correct revision domain.

- [ ] **Step 2: Run RED**

```bash
node --test tests/business.test.js tests/taphoa-mutation-rpc-contract.test.js
```

Expected: FAIL because frontend still calls generic RPC names and mutation migration is absent.

- [ ] **Step 3: Implement mutation SQL**

Preserve existing semantics:

```text
save pending/delivered order -> insert taphoa_orders + taphoa_order_items
pending -> delivered -> create positive sale ledger entry
reversal of delivered -> mark reversed + create equal negative reversal ledger entry
delete pending -> remove only pending order
batch action -> apply only allowed action to supplied IDs
debt transaction -> payment/collection/adjustment ledger entry
```

Every mutation must derive the actor from `auth.uid() -> v21_accounts`, require `role='admin'`, use transaction-level row locks on affected order rows, and accept `p_command_id uuid` through a dedicated `taphoa_command_log(command_id uuid primary key, result jsonb, created_at timestamptz)` so duplicate client retries return the original result rather than applying twice.

- [ ] **Step 4: Run migration/unit tests**

```bash
node --test tests/business.test.js tests/taphoa-mutation-rpc-contract.test.js
npm test
```

Expected: PASS after `src/core/business.js` is changed in Task 5; at this task boundary the SQL contract must be green and the business test may remain intentionally RED until frontend cutover. Record that dependency instead of weakening the test.

- [ ] **Step 5: Apply migration and run database smoke transactions**

With a temporary test order in the new TAPHOA namespace only:

```text
save pending -> one order, N items
duplicate same command_id -> still one order
deliver -> one sale ledger row
duplicate deliver command_id -> still one sale ledger row
reverse -> one reversal row; net order debt contribution returns to zero
```

Delete only this new TAPHOA test order/ledger data after smoke verification.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260915030000_taphoa_mutation_rpcs.sql tests/taphoa-mutation-rpc-contract.test.js tests/business.test.js
git commit -m "feat: add TAPHOA order and debt mutations"
```

---

### Task 4: Build one-way management Sheet sync owned by TAPHOA

**Files:**
- Create: `supabase/functions/taphoa-sheet-sync/index.ts`
- Create: `supabase/functions/taphoa-sheet-sync/deno.json`
- Create: `tests/taphoa-sheet-sync-contract.test.js`
- Create: `supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql`

**Interfaces:**
- Consumes: management Sheet ID and existing `GOOGLE_SERVICE_ACCOUNT_JSON` secret; Task 1 product/source/revision/sync-state tables.
- Produces: Edge Function `taphoa-sheet-sync` and one-minute cron trigger; manual Admin authenticated sync action.

- [ ] **Step 1: Write RED sync contract tests**

The test must assert all five source tabs/prefixes, A/B/C/D/E/G/K/L/P column ownership, Drive `modifiedTime` short-circuit, product upsert keyed by `product_code`, missing-code deactivation, and no GETLINK table writes:

```js
for(const tab of ['Hàng U','Thuốc lá','Sữa','Hàng masan','Hàng thường']) assert.match(src,new RegExp(tab));
assert.match(src,/1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU/);
assert.match(src,/taphoa_products/);
assert.match(src,/taphoa_revisions/);
assert.doesNotMatch(src,/getlink_supplier_products|writePairToNcc|values:batchUpdate/);
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/taphoa-sheet-sync-contract.test.js
```

Expected: FAIL because worker does not exist.

- [ ] **Step 3: Implement parser and price calculation as pure functions first**

Keep these functions deterministic and testable:

```ts
function clean(v:unknown):string
function num(v:unknown):number|null
function statusInfo(raw:string,price:number|null):{active:boolean,status:'available'|'out_of_stock'|'no_price',label:string}
function mapManagerRow(sourceKey:string,row:any[],rowNo:number):TaphoaProduct|null
```

Required mapping:

```ts
const name=clean(row[0]);
const inputSheet=num(row[1]);
const status=clean(row[2]);
const basis=clean(row[3]).toLowerCase()==='lẻ'?'retail':'carton';
const expectedRatio=num(row[4]);
const appliedSheet=num(row[6]);
const units=num(row[10]);
const retailUnit=clean(row[11]);
const code=clean(row[15]).toUpperCase();
```

Convert sheet thousand-VND values to VND with `Math.round(value*1000)`. `expected_profit_percent` is `expectedRatio*100`. Sale/carton/retail prices must match the approved spec exactly.

- [ ] **Step 4: Implement worker transaction semantics**

Flow:

```text
GET/POST -> authorize cron secret OR authenticated Admin
Drive files.get(modifiedTime)
if unchanged -> 200 {changed:false}
set sync state running
read all five tabs A:P
map rows
upsert 5 taphoa_sources
upsert taphoa_products in chunks
mark previous source codes missing from current source inactive
only after all five sources succeed: revision(products) += 1
write successful sync state with imported count + modifiedTime
on failure: write error state; DO NOT increment revision
```

Do not write to Google Sheets and do not use any GETLINK business table.

- [ ] **Step 5: Add one-minute cron migration**

Use a dedicated cron name such as `taphoa_sheet_sync_every_minute`. It calls only the new Edge Function. Do not modify GETLINK cron jobs yet.

- [ ] **Step 6: Run tests and Deno type check**

```bash
node --test tests/taphoa-sheet-sync-contract.test.js
deno check supabase/functions/taphoa-sheet-sync/index.ts
npm test
```

Expected: PASS.

- [ ] **Step 7: Deploy worker, run first forced full sync, and verify before any reset**

Verification SQL:

```sql
select source_key,count(*) as rows,
       count(*) filter(where is_active) as active
from public.taphoa_products
group by source_key
order by source_key;

select count(*) from public.taphoa_sources;
select * from public.taphoa_sheet_sync_state where id=1;
select revision from public.taphoa_revisions where domain='products';
```

Also manually compare at least one carton-basis row and one retail-basis row against the management Sheet: input price, applied profit, sale price, pack quantity and derived retail/carton price.

**Gate:** Do not continue to Task 5 unless this full import succeeds and `taphoa_sources=5` with nonzero products.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/taphoa-sheet-sync supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql tests/taphoa-sheet-sync-contract.test.js
git commit -m "feat: sync TAPHOA products from management sheet"
```

---

### Task 5: Cut the frontend to shared V21 credentials and TAPHOA RPCs

**Files:**
- Modify: `src/core/config.js`
- Modify: `src/core/auth.js`
- Modify: `src/core/business.js`
- Modify: `src/core/snapshot.js`
- Modify: `src/app.js`
- Modify: `tests/business.test.js`
- Modify: `tests/snapshot.test.js`
- Create: `tests/shared-auth-contract.test.js`

**Interfaces:**
- Consumes: Tasks 1-4 deployed backend.
- Produces: production frontend using only shared project + `taphoa_*` business RPCs; cache version `2` (or higher) invalidating all retired generic snapshots.

- [ ] **Step 1: Write RED shared-auth tests**

Assert config points to shared project and the auth module uses the Chat credential convention rather than `shop-auth` / `shop_identities`:

```js
assert.match(config,/gcnoahqsrquxkwkjbuxy\.supabase\.co/);
assert.doesNotMatch(auth,/shop_identities|shop-auth/);
assert.match(auth,/signInWithPassword/);
assert.match(auth,/@taphoa\.chat/);
assert.match(auth,/taphoa_access_context/);
```

- [ ] **Step 2: Update `tests/business.test.js` to exact namespaced RPC calls**

Expected calls:

```text
bootstrap -> taphoa_app_bootstrap
meta -> taphoa_app_meta
domains -> taphoa_app_domains
orderDetail -> taphoa_order_detail
debtLedger -> taphoa_debt_ledger_page
saveOrder -> taphoa_save_order
deliverOrder -> taphoa_deliver_order
reverseOrder -> taphoa_reverse_order
deletePending -> taphoa_delete_pending_order
batchOrders -> taphoa_batch_orders
debtTransaction -> taphoa_debt_transaction
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/shared-auth-contract.test.js tests/business.test.js tests/snapshot.test.js
```

Expected: FAIL on old project URL/auth owner/RPC names/cache version.

- [ ] **Step 4: Implement shared-project config and auth**

`CONFIG` must contain the shared URL/key and a TAPHOA-specific auth storage key:

```js
export const CONFIG=Object.freeze({
  supabaseUrl:'https://gcnoahqsrquxkwkjbuxy.supabase.co',
  publishableKey:'<current shared publishable key>',
  supabaseModuleUrl:'https://esm.sh/@supabase/supabase-js@2.112.3?standalone',
  authStorageKey:'taphoa.xyz.auth.v2',
  identityStorageKey:'taphoa.identity.v2',
  usernameStorageKey:'taphoa.username.v1'
});
```

`login(username,password)` normalizes username, calls `signInWithPassword({email:`${username}@taphoa.chat`,password})`, then calls `taphoa_access_context()`. Denied friend/other accounts must immediately sign out locally and surface `Tài khoản không có quyền vào Tạp hóa`.

`restore()` must re-check `taphoa_access_context()` online; stale identity hints cannot grant access.

- [ ] **Step 5: Change Business Service RPC names only**

Do not alter screen business semantics or payload shapes. Keep `orderRpcPayload()` unchanged except for namespaced RPC routing.

- [ ] **Step 6: Bump snapshot cache version and key**

Change snapshot storage to a new prefix/version, for example:

```js
const DEFAULT_CACHE_VERSION=2;
const KEY_PREFIX='taphoa.snapshot.v2:';
```

Old `taphoa.snapshot.v1:*` entries must never load after cutover.

- [ ] **Step 7: Run full frontend tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 8: Production auth/browser gate before destructive reset**

Verify in deployed TAPHOA:

```text
shared Admin credentials -> app opens as Admin
one active User/customer -> app opens and sees only self-scoped order/debt data
one User/friend -> denied
one User/other -> denied
browser network -> no crdbhkdeqyehsbzgggbs requests
browser network -> no GETLINK business request
products visible from taphoa_products Sheet sync
```

**Gate:** Do not continue to Task 6 until all five checks pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/config.js src/core/auth.js src/core/business.js src/core/snapshot.js src/app.js tests/business.test.js tests/snapshot.test.js tests/shared-auth-contract.test.js
git commit -m "feat: cut TAPHOA to shared accounts and namespaced RPCs"
```

---

### Task 6: Reset all retired TAPHOA generic business data safely

**Files:**
- Create: `supabase/migrations/20260915060000_reset_retired_taphoa_generic_data.sql`
- Create: `tests/taphoa-reset-boundary.test.js`
- Create: `docs/superpowers/plans/2026-09-15-taphoa-reset-evidence.md`

**Interfaces:**
- Consumes: green production backend/frontend from Tasks 1-5.
- Produces: old generic `accounts/products/product_sources/orders/order_items/debts` empty; shared V21 account population unchanged; new `taphoa_*` products remain populated and new order/debt state remains empty except explicit smoke-test rows already cleaned.

- [ ] **Step 1: Capture immutable pre-reset counts**

Run and paste results into the evidence doc:

```sql
select 'accounts' table_name,count(*) rows from public.accounts
union all select 'products',count(*) from public.products
union all select 'product_sources',count(*) from public.product_sources
union all select 'orders',count(*) from public.orders
union all select 'order_items',count(*) from public.order_items
union all select 'debts',count(*) from public.debts;

select role,contact_group,count(*)
from public.v21_accounts
where deleted_at is null
group by role,contact_group
order by role,contact_group;

select count(*) as taphoa_products from public.taphoa_products;
select count(*) as taphoa_orders from public.taphoa_orders;
select count(*) as taphoa_debt_rows from public.taphoa_debt_ledger;
```

Expected baseline from design discovery for generic tables is 41/649/5/421/2258/643 respectively, but execution must trust fresh counts, not these historical numbers.

- [ ] **Step 2: Write RED reset-boundary test**

```js
assert.match(sql,/truncate\s+table[\s\S]*order_items[\s\S]*orders[\s\S]*debts[\s\S]*products[\s\S]*product_sources[\s\S]*accounts/i);
assert.doesNotMatch(sql,/v21_accounts|auth\.users|chat_/i);
assert.doesNotMatch(sql,/drop\s+schema|cascade/i);
```

- [ ] **Step 3: Run RED**

```bash
node --test tests/taphoa-reset-boundary.test.js
```

Expected: FAIL because destructive migration does not exist.

- [ ] **Step 4: Create the exact FK-safe reset migration**

The destructive SQL must target only the approved six generic tables and must not use `CASCADE`:

```sql
truncate table public.order_items;
truncate table public.orders;
truncate table public.debts;
truncate table public.products;
truncate table public.product_sources;
truncate table public.accounts;
```

If FK constraints prevent this sequence, inspect the actual FK graph and change to explicit `delete from` in dependency order; do not add `CASCADE` and do not widen the target list.

- [ ] **Step 5: Run GREEN boundary test**

```bash
node --test tests/taphoa-reset-boundary.test.js
```

Expected: PASS.

- [ ] **Step 6: Recheck destructive preconditions immediately before execution**

All must be true in the same session:

```text
taphoa_products > 0
taphoa_sources = 5
last sheet sync status = success
Admin frontend login = PASS
customer frontend login = PASS
friend/other denial = PASS
new taphoa_orders = 0
new taphoa_debt_ledger = 0
```

If any condition is false, stop and do not run the reset.

- [ ] **Step 7: Apply the reset migration**

Apply exactly `20260915060000_reset_retired_taphoa_generic_data.sql`.

- [ ] **Step 8: Capture post-reset evidence immediately**

Run the same queries from Step 1. Required result:

```text
accounts=0
products=0
product_sources=0
orders=0
order_items=0
debts=0
v21_accounts grouped counts == PRE-RESET counts exactly
taphoa_products remains > 0
taphoa_sources remains 5
taphoa_orders=0
taphoa_debt_ledger=0
```

Save the exact timestamp and counts into `docs/superpowers/plans/2026-09-15-taphoa-reset-evidence.md`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260915060000_reset_retired_taphoa_generic_data.sql tests/taphoa-reset-boundary.test.js docs/superpowers/plans/2026-09-15-taphoa-reset-evidence.md
git commit -m "chore: reset retired TAPHOA business data"
```

---

### Task 7: Production end-to-end verification and handoff to GETLINK decommission

**Files:**
- Create: `tests/taphoa-cutover-static.test.js`
- Create: `docs/superpowers/plans/2026-09-15-taphoa-cutover-result.md`
- Modify: `.github/workflows/data-read-check.yml`

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: a repeatable CI gate proving TAPHOA no longer references the old Supabase project, generic RPC names or GETLINK business data; evidence required before a separate GETLINK cleanup plan may start.

- [ ] **Step 1: Write static cutover gate**

Test all runtime source files under `src/`:

```js
assert.doesNotMatch(allRuntime,/crdbhkdeqyehsbzgggbs/);
assert.doesNotMatch(allRuntime,/\b(app_bootstrap|app_meta|app_domains|save_order|deliver_order|reverse_order)\b/);
assert.doesNotMatch(allRuntime,/getlink-api|get\.taphoa\.xyz/);
assert.match(allRuntime,/gcnoahqsrquxkwkjbuxy/);
```

Allow the generic RPC strings only inside historical docs/tests that are explicitly excluded from the runtime scan.

- [ ] **Step 2: Update CI to run the new gates**

Add these commands to `data-read-check.yml`:

```yaml
- run: node --test tests/*.test.js
- run: npm run build
```

Do not remove existing scroll/security/build gates.

- [ ] **Step 3: Run fresh full verification**

```bash
npm test
npm run build
```

Then verify the GitHub Actions run for the final clean commit is green.

- [ ] **Step 4: Browser/business smoke test**

Admin path:

```text
login -> Bán shows Sheet-synced products -> select customer -> create pending order -> deliver -> debt increases -> reverse -> debt returns appropriately
```

Customer path:

```text
login as User/customer -> cannot access other customer data -> sees only own order/debt scope
```

After smoke test, remove only deliberately created test business rows through the new namespaced API, not direct generic-table SQL.

- [ ] **Step 5: Record final production evidence**

`docs/superpowers/plans/2026-09-15-taphoa-cutover-result.md` must include:

```text
final Git commit SHA
CI run URL/id and conclusion
Sheet sync timestamp + product/source counts
pre/post generic reset counts
pre/post v21_accounts grouped counts
Admin auth PASS
customer auth PASS
friend/other deny PASS
Bán pending/deliver/reverse PASS
no old Supabase runtime request PASS
no GETLINK runtime request PASS
```

- [ ] **Step 6: Commit**

```bash
git add tests/taphoa-cutover-static.test.js .github/workflows/data-read-check.yml docs/superpowers/plans/2026-09-15-taphoa-cutover-result.md
git commit -m "test: lock TAPHOA independent cutover"
```

- [ ] **Step 7: Start a separate GETLINK decommission plan only after final TAPHOA gate is green**

Create in `1sl2tp/getlink`:

```text
docs/superpowers/plans/2026-09-15-remove-taphoa-from-getlink.md
```

That plan owns removal of the Tạp hóa tab/runtime/data-sync ownership from GETLINK. Do not mix those destructive GETLINK changes into this TAPHOA plan.

---

## Self-review result

- Spec coverage: shared auth, access gate, namespaced schema/RPCs, customer derivation, one-way Sheet sync, revision updates, frontend cutover, snapshot invalidation, destructive generic reset, account-preservation proof and final production verification are all assigned to explicit tasks.
- Scope split: GETLINK decommission remains a separate plan as required by the approved spec.
- Placeholder scan: no implementation step depends on unspecified business rules; all destructive targets and verification queries are explicit.
- Type/name consistency: all frontend calls use the same `taphoa_*` RPC names defined by backend tasks; customer identity consistently uses `v21_accounts.id`; product identity consistently uses `product_code`.
