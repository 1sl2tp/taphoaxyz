import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const files=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const sql=files.map(name=>fs.readFileSync(path.join(migrationsDir,name),'utf8')).join('\n\n');

function latestFunction(name){
  const marker=`create or replace function public.${name}`;
  const lower=sql.toLowerCase();
  const start=lower.lastIndexOf(marker.toLowerCase());
  assert.notEqual(start,-1,`missing function ${name}`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1,`unterminated function ${name}`);
  return sql.slice(start,end+3);
}

test('order receipt contains compact order details and optional debt balance',()=>{
  const fn=latestFunction('taphoa_chat_order_receipt');
  assert.match(fn,/tongMa/);
  assert.match(fn,/tongSL/);
  assert.match(fn,/taphoa_chat_money\(v_total_vnd\)/);
  assert.match(fn,/taphoa_chat_order_lines\(p_order_json,5\)/);
  assert.match(fn,/taphoa_chat_balance_label\(p_balance_vnd,false\)/);
});

test('delivered order notification includes receipt details and current balance',()=>{
  const fn=latestFunction('taphoa_deliver_order');
  assert.match(fn,/taphoa_chat_customer_balance_vnd\(o\.customer_account_id\)/);
  assert.match(fn,/taphoa_chat_order_receipt\([\s\S]*?'Đơn '\s*\|\|\s*v_display_code\s*\|\|\s*' đã giao'/);
});

test('collection notification contains before and after debt state',()=>{
  const fn=latestFunction('taphoa_debt_transaction');
  assert.match(fn,/v_balance_before\s*:=\s*public\.taphoa_chat_customer_balance_vnd\(p_customer_id\)/);
  assert.match(fn,/v_balance_after\s*:=\s*public\.taphoa_chat_customer_balance_vnd\(p_customer_id\)/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_before,true\)/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_after,false\)/);
  assert.match(fn,/Ghi chú:/);
});

test('edited order notification reports item, price, total and delivered debt changes',()=>{
  const fn=latestFunction('taphoa_save_order');
  assert.match(fn,/v_old_order_json\s*:=\s*public\.taphoa_order_frontend_json\(v_order\)/);
  assert.match(fn,/taphoa_chat_order_diff\(v_old_order_json,v_order_json,6\)/);
  assert.match(fn,/Tổng: /);
  assert.match(fn,/Ghi chú: /);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_before,true\)/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_after,false\)/);
});

test('order diff explicitly reports quantity, price, added and removed items',()=>{
  const fn=latestFunction('taphoa_chat_order_diff');
  assert.match(fn,/SL '\s*\|\|[\s\S]*?' → '/);
  assert.match(fn,/Giá '/);
  assert.match(fn,/thêm ×/);
  assert.match(fn,/→ bỏ/);
});
