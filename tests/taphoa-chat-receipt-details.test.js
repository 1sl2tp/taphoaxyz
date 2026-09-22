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

test('order receipt is compact, shows code counts preview time and direct app link',()=>{
  const fn=latestFunction('taphoa_chat_order_receipt');
  for(const pattern of [
    /tongMa/,
    /tongSL/,
    /' sản phẩm'/,
    /taphoa_chat_money\(v_total_vnd\)/,
    /taphoa_chat_order_lines\(p_order_json,2\)/,
    /taphoa_chat_when\(v_at\)/,
    /taphoa_customer_mini_link\(v_customer,'don',null,null,v_code\)/,
    /Xem đơn:/,
  ])assert.match(fn,pattern);
  assert.doesNotMatch(fn,/taphoa_chat_balance_label\(p_balance_vnd,false\)/);
});

test('order preview uses at most two products and counts the remainder as product codes',()=>{
  const fn=latestFunction('taphoa_chat_order_lines');
  assert.match(fn,/default 2/i);
  assert.match(fn,/limit greatest\(coalesce\(p_limit,2\),1\)/);
  assert.match(fn,/' mã'/);
  assert.doesNotMatch(fn,/' dòng'/);
});

test('edit notification is normalized to the single word Cập nhật and skips no-op edits',()=>{
  const fn=latestFunction('taphoa_chat_notify_customer');
  assert.match(fn,/like '%đã được sửa%'/i);
  assert.match(fn,/taphoa_chat_order_receipt\(v_order_json,'Cập nhật',null\)/);
  assert.match(fn,/Không có thay đổi nội dung\.[\s\S]*?return null/i);
});

test('cash collection is one compact line plus weekday time and app debt link',()=>{
  const fn=latestFunction('taphoa_chat_notify_customer');
  assert.match(fn,/like 'taphoa:%:collection'/);
  assert.match(fn,/'Đã thu ' \|\| v_amount_text/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance,false\)/);
  assert.match(fn,/taphoa_chat_when\(now\(\)\)/);
  assert.match(fn,/taphoa_customer_mini_link\(p_customer_id,'no',null,null,null\)/);
  assert.doesNotMatch(fn,/Nợ trước:/);
});

test('customer links use one mini app shell and deep-link the active function',()=>{
  const helper=latestFunction('taphoa_customer_mini_link');
  assert.match(helper,/https:\/\/app\.taphoa\.xyz\/kh\/\?kh=/);
  assert.match(helper,/'&tab=' \|\| v_tab/);
  assert.match(helper,/'&nguon='/);
  assert.match(helper,/'&muc='/);
  assert.match(helper,/'&don='/);
});

test('weekday formatter is fixed to Vietnam time',()=>{
  const fn=latestFunction('taphoa_chat_when');
  for(const label of ['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ nhật'])assert.ok(fn.includes(label),label);
  assert.match(fn,/Asia\/Ho_Chi_Minh/);
  assert.match(fn,/HH24:MI · DD\/MM/);
});
