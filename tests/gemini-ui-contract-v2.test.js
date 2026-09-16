import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('TAPHOA_GEMINI_100_SAMPLE_FIXED is the only production UI contract',()=>{
  const index=read('index.html');
  const sales=read('src/screens/sales.js');
  const shell=read('src/styles/shell.css');

  assert.doesNotMatch(index,/gemini-production-ui\.js/,'decorator UI must not be mounted');
  assert.doesNotMatch(index,/gemini-ui\.css/,'overlay skin must not be loaded');
  assert.match(index,/@phosphor-icons\/web/,'FIXED UI uses Phosphor icons');

  assert.match(sales,/TAPHOA_GEMINI_100_SAMPLE_FIXED/);
  for(const text of ['Chọn khách hàng','Tìm tên, mã sản phẩm...','Giỏ hàng','TÊN SP','Tổng thanh toán','BÁN NGAY']){
    assert.match(sales,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }

  assert.match(shell,/max-width:\s*1240px/);
  assert.match(shell,/480px/);
  assert.match(shell,/border-radius:\s*24px/);
});

test('business mutation API remains wired to existing production commands',()=>{
  const business=read('src/core/business.js');
  for(const command of ['taphoa_save_order','taphoa_deliver_order','taphoa_reverse_order','taphoa_delete_pending_order','taphoa_debt_transaction']){
    assert.match(business,new RegExp(command));
  }
});
