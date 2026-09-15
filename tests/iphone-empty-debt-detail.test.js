import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredMarkup} from '../src/screens/delivered.js';
import {debtMarkup} from '../src/screens/debt.js';

test('delivered empty state is rendered only once',()=>{
  const html=deliveredMarkup({orders:[],permissions:{}});
  assert.equal((html.match(/Không có đơn/g)||[]).length,1);
  assert.match(html,/Tổng hợp đã giao <small>\(0 đơn\)<\/small>/);
});

test('debt customer without a transaction date has no empty GD cuối label',()=>{
  const html=debtMarkup({summary:[{maKH:'c1',ten:'A Hậu Còi',soDu:0}],canManage:false});
  assert.match(html,/A Hậu Còi/);
  assert.doesNotMatch(html,/GD cuối:/);
});

test('zero-balance debt detail shows one empty ledger message and a blank amount input',()=>{
  const html=debtMarkup({
    summary:[{maKH:'c1',ten:'A Hậu Còi',soDu:0}],
    customers:[{id:'c1',ten:'A Hậu Còi'}],
    canManage:true,
    selectedCustomerId:'c1',
    detailAmount:'',
    detail:{customer:{id:'c1',ten:'A Hậu Còi'},soDu:0,transactions:[]}
  });
  assert.match(html,/Chưa có giao dịch/);
  assert.match(html,/data-detail-amount[^>]*value=""/);
  assert.doesNotMatch(html,/data-detail-amount[^>]*value="0"/);
});

test('debt detail date uses the shared two-digit day month format',()=>{
  const html=debtMarkup({
    summary:[{maKH:'c1',ten:'A Hậu Còi',soDu:0}],
    canManage:false,
    selectedCustomerId:'c1',
    detail:{customer:{id:'c1',ten:'A Hậu Còi'},soDu:0,transactions:[]}
  });
  assert.match(html,/\d{2}\/\d{2}\/\d{4}/);
});
