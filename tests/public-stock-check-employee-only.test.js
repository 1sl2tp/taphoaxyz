import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kiemhang/index.html',import.meta.url),'utf8').toLowerCase();

test('standalone stock check page is employee-only and never shows money',()=>{
  for(const needle of [
    "snapshot.role==='owner'",
    'location.replace(string(snapshot.owner_url))',
    "snapshot.role!=='employee'",
    "const action='submit'",
    'nhân viên kiểm số lượng · không hiển thị giá/tiền',
    'gửi kiểm hàng',
  ])assert.ok(html.includes(needle),needle);

  for(const forbidden of [
    "snapshot.role==='owner'?'update':'submit'",
    "snapshot.role==='owner'&&number(p.sale_price_vnd)",
    'chủ cửa hàng rà soát số lượng và cập nhật',
  ])assert.equal(html.includes(forbidden),false,forbidden);
});
