import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('order lines persist a frozen cost snapshot',()=>{
  const sql=read('supabase/migrations/20260921225000_taphoa_order_cost_snapshot.sql');
  assert.match(sql,/add column if not exists unit_cost_vnd_snapshot bigint/i);
  assert.match(sql,/set unit_cost_vnd_snapshot = coalesce\(p\.input_price_vnd,0\)/i);
  assert.match(sql,/alter column unit_cost_vnd_snapshot set not null/i);
  assert.match(sql,/'von',oi\.unit_cost_vnd_snapshot::numeric \/ 1000\.0/i);
  assert.match(sql,/'unit_cost',oi\.unit_cost_vnd_snapshot::numeric \/ 1000\.0/i);
  assert.match(sql,/sum\(oi\.qty \* oi\.unit_cost_vnd_snapshot\)/i);
});

test('editing or delivering an existing order preserves its original cost snapshot',()=>{
  const sql=read('supabase/migrations/20260921225000_taphoa_order_cost_snapshot.sql');
  assert.match(sql,/jsonb_object_agg\(product_code,unit_cost_vnd_snapshot\)/i);
  assert.match(sql,/v_old_costs->>\(item->>'product_id'\)/i);
  assert.match(sql,/coalesce\([\s\S]*v_old_costs[\s\S]*p\.input_price_vnd[\s\S]*0[\s\S]*\)/i);
});

test('legacy order rows carry frozen cost and both order lists calculate profit from it',()=>{
  const bridge=read('src/fixed-production-bridge.js');
  const pending=read('src/fixed-ui-runtime-10.js');
  const delivered=read('src/fixed-ui-runtime-11.js');
  assert.match(bridge,/Giá vốn snapshot/);
  assert.match(bridge,/first\(item,\['unit_cost','von'\],0\)/);
  assert.match(bridge,/String\(costSnapshot\)/);
  for(const runtime of [pending,delivered]){
    assert.match(runtime,/const hasCostSnapshot = r\[10\] !== undefined/);
    assert.match(runtime,/const unitCost = hasCostSnapshot \? \(Number\(r\[10\]\) \|\| 0\) : spInfo\.von/);
    assert.match(runtime,/let chi = unitCost \* sl; let thu = donGia \* sl; let lai = thu - chi;/);
  }
});

test('production asset versions include order cost snapshot fix',()=>{
  const html=read('index.html');
  assert.match(html,/fixed-production-bridge\.js\?v=employee-link-real-ui-20260923/);
  assert.match(html,/fixed-ui-runtime-10\.js\?v=order-empty-state-20260922/);
  assert.match(html,/fixed-ui-runtime-11\.js\?v=order-empty-state-20260922/);
});
