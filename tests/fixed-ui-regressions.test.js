import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseLedgerTime,
  sortLedgerRowsOldestFirst,
  isInternalDebtEntry,
  visibleDebtHistoryNewestFirst,
  normalizeFixedSalesHeaderChildren,
} from '../src/core/fixed-ui-regressions.js';

test('ledger time parser accepts both production time layouts',()=>{
  const a=parseLedgerTime('08:45:00 16/09/2026');
  const b=parseLedgerTime('16/09/2026 08:45:00');
  assert.equal(a,b);
  assert.ok(Number.isFinite(a));
});

test('ledger rows are accumulated oldest first independent of API order',()=>{
  const rows=[
    ['3','KH1','Ghi nợ mới','300','10:00:00 17/09/2026'],
    ['1','KH1','Ghi nợ cũ','100','08:00:00 16/09/2026'],
    ['2','KH1','Thu tiền','-50','09:00:00 17/09/2026'],
  ];
  assert.deepEqual(sortLedgerRowsOldestFirst(rows).map(r=>r[0]),['1','2','3']);
});

test('reverse/refund bookkeeping stays in balance math but is hidden from debt history UI',()=>{
  assert.equal(isInternalDebtEntry('Hoàn đơn DG917'),true);
  assert.equal(isInternalDebtEntry('Đảo đơn DG917'),true);
  assert.equal(isInternalDebtEntry('reverse order DG917'),true);
  assert.equal(isInternalDebtEntry('Ghi nợ đơn DG917'),false);

  const history=[
    {loaiGd:'Ghi nợ đơn DG917',time:'08:00:00 16/09/2026'},
    {loaiGd:'Hoàn đơn DG917',time:'09:00:00 17/09/2026'},
    {loaiGd:'Thu tiền mặt',time:'10:00:00 17/09/2026'},
  ];
  assert.deepEqual(
    visibleDebtHistoryNewestFirst(history).map(x=>x.loaiGd),
    ['Thu tiền mặt','Ghi nợ đơn DG917'],
  );
});

test('FIXED sales header keeps exactly customer, clock and cart controls',()=>{
  const customer={id:'customer'};
  const clock={id:'clock'};
  const cart={id:'cart'};
  const extraAccount={id:'legacy-account'};
  const duplicateCustomer={id:'duplicate-customer'};
  const header={
    children:[customer,extraAccount,clock,duplicateCustomer,cart],
    removeChild(node){this.children=this.children.filter(x=>x!==node);},
    appendChild(node){this.children=this.children.filter(x=>x!==node);this.children.push(node);},
  };
  normalizeFixedSalesHeaderChildren(header,[customer,clock,cart]);
  assert.deepEqual(header.children,[customer,clock,cart]);
});

test('production owns regressions inside the stable override instead of adding bootstrap scripts',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
  const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');

  assert.equal(index.includes('fixed-regression-overrides.js'),false);
  assert.equal(index.includes('src/core/fixed-ui-regressions.js'),false);
  assert.match(overrides,/function normalizeSalesHeaderFixedOnly\(/);
  assert.match(overrides,/function renderProductionDebt\(/);
  assert.match(overrides,/clickOrderFromDebt=function\(/);
  assert.match(bridge,/function ledgerNoteWithOrderId\(/);
});
