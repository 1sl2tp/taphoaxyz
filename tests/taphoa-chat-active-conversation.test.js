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

test('TAPHOA notices prefer the most recently active human conversation across reversed duplicates',()=>{
  const fn=latestFunction('taphoa_chat_notify_customer');
  assert.match(fn,/c\.member_a=p_sender_account_id\s+and\s+c\.member_b=p_customer_id/i);
  assert.match(fn,/c\.member_a=p_customer_id\s+and\s+c\.member_b=p_sender_account_id/i);
  assert.match(fn,/m\.client_id\s+not\s+like\s+'taphoa:%'/i);
  assert.match(fn,/order\s+by\s+activity\.latest_at\s+desc\s+nulls\s+last\s*,\s*c\.created_at\s+desc\s*,\s*c\.id/i);
});

test('repair migration moves only TAPHOA notices emitted by the new integration',()=>{
  assert.match(sql,/where\s+m\.client_id\s+like\s+'taphoa:%'[\s\S]*?m\.created_at\s+>=\s+'2026-09-22T09:40:00Z'/i);
  assert.match(sql,/update\s+public\.v21_messages\s+m\s+set\s+conversation_id=t\.target_conversation_id/i);
  assert.match(sql,/m\.conversation_id\s+is\s+distinct\s+from\s+t\.target_conversation_id/i);
});
