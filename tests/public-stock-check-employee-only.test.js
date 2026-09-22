import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kiemhang/index.html',import.meta.url),'utf8').toLowerCase();

test('employee stock link is a PIN-gated quantity-only live product screen',()=>{
  for(const needle of [
    "snapshot.role==='owner'",
    'location.replace(string(snapshot.owner_url))',
    "snapshot.role!=='employee'",
    "action:'save'",
    'settimeout(()=>void persistdraft(),100)',
    'await fetch(api',
    'nhập mã pin',
    'chủ cửa hàng chưa tạo pin',
    'x-employee-pin',
    'showemployeepingate',
    'showownerpinmissing',
    'function rememberemployeepin(){return;}',
    'sessionstorage.removeitem(pinstorekey)',
    '>bán hàng<',
    "'tất cả'",
    'data-delta="-1"',
    'data-delta="1"',
    'rendertotal()'
  ])assert.ok(html.includes(needle),needle);

  assert.equal(html.includes('sessionstorage.getitem(pinstorekey)'),false,'employee PIN must not persist across link opens');

  for(const forbidden of [
    "const action='submit'",
    'gửi kiểm hàng',
    'xóa / nhập lại',
    'summary-money',
    'sale_price_vnd',
    'chủ cửa hàng rà soát số lượng và cập nhật',
    '>chủ<',
    '>gửi link<'
  ])assert.equal(html.includes(forbidden),false,forbidden);
});
