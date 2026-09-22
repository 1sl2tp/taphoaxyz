import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const migrationFiles=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const sql=migrationFiles.map(name=>fs.readFileSync(path.join(migrationsDir,name),'utf8')).join('\n\n');

function latestFunction(name){
  const marker=`create or replace function public.${name}`;
  const lower=sql.toLowerCase();
  const start=lower.lastIndexOf(marker.toLowerCase());
  assert.notEqual(start,-1,`missing function ${name}`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1,`unterminated function ${name}`);
  return sql.slice(start,end+3);
}

test('TAPHOA chat helper writes canonical idempotent V21 messages only for admin-to-customer',()=>{
  const fn=latestFunction('taphoa_chat_notify_customer');
  assert.match(fn,/role='admin'/i);
  assert.match(fn,/role='user'[\s\S]*?contact_group='customer'/i);
  assert.match(fn,/insert\s+into\s+public\.v21_conversations\s*\(\s*member_a\s*,\s*member_b\s*\)/i);
  assert.match(fn,/insert\s+into\s+public\.v21_messages\s*\(\s*conversation_id\s*,\s*sender_account_id\s*,\s*client_id\s*,\s*body\s*\)/i);
  assert.match(fn,/on\s+conflict\s+on\s+constraint\s+v21_messages_sender_account_id_client_id_key\s+do\s+nothing/i);
});

test('admin order save emits one detailed create, edit or delivered notice for a real customer',()=>{
  const fn=latestFunction('taphoa_save_order');
  assert.match(fn,/v_role='admin'\s+and\s+v_customer\s+is\s+not\s+null/i);
  assert.match(fn,/taphoa_chat_order_receipt\([\s\S]*?'Đơn '\s*\|\|\s*v_display_code\s*\|\|\s*' đã được tạo'/);
  assert.match(fn,/v_notice\s*:=\s*'Đơn '\s*\|\|\s*v_display_code\s*\|\|\s*' đã được sửa'/);
  assert.match(fn,/taphoa_chat_order_receipt\([\s\S]*?'Đơn '\s*\|\|\s*v_display_code\s*\|\|\s*' đã giao'/);
  assert.equal((fn.match(/taphoa_chat_notify_customer/g)||[]).length,1);
  assert.match(fn,/'taphoa:'\s*\|\|\s*p_command_id::text\s*\|\|\s*':order'/);
});

test('dedicated delivery mutation emits exactly one detailed delivered receipt',()=>{
  const fn=latestFunction('taphoa_deliver_order');
  assert.match(fn,/customer_account_id\s+is\s+not\s+null/i);
  assert.match(fn,/taphoa_chat_order_receipt\([\s\S]*?'Đơn '\s*\|\|\s*v_display_code\s*\|\|\s*' đã giao'/);
  assert.match(fn,/taphoa_chat_customer_balance_vnd\(o\.customer_account_id\)/);
  assert.equal((fn.match(/taphoa_chat_notify_customer/g)||[]).length,1);
  assert.match(fn,/'taphoa:'\s*\|\|\s*p_command_id::text\s*\|\|\s*':deliver'/);
});

test('cash collection emits exactly one receipt with before and after balance',()=>{
  const fn=latestFunction('taphoa_debt_transaction');
  assert.match(fn,/if\s+v_entry_type='collection'\s+then[\s\S]*?taphoa_chat_notify_customer/i);
  assert.match(fn,/v_notice\s*:=\s*'Đã thu '\s*\|\|\s*public\.taphoa_chat_money\(v_amount_vnd\)/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_before,true\)/);
  assert.match(fn,/taphoa_chat_balance_label\(v_balance_after,false\)/);
  assert.equal((fn.match(/taphoa_chat_notify_customer/g)||[]).length,1);
  assert.match(fn,/'taphoa:'\s*\|\|\s*p_command_id::text\s*\|\|\s*':collection'/);
});
