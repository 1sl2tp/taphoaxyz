import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mini=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8');
const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const files=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const sql=files.map(name=>fs.readFileSync(path.join(migrationsDir,name),'utf8')).join('\n\n');

function latestFunction(name){
  const marker=`create or replace function public.${name}`;
  const start=sql.toLowerCase().lastIndexOf(marker.toLowerCase());
  assert.notEqual(start,-1,`missing function ${name}`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1,`unterminated function ${name}`);
  return sql.slice(start,end+3);
}

test('customer-facing money preserves literal values and only formats thousands separators',()=>{
  assert.match(mini,/Math\.abs\(Number\(v\)\|\|0\)/);
  assert.match(mini,/Intl\.NumberFormat\('vi-VN'/);
  assert.doesNotMatch(mini,/\/1000/);
  assert.doesNotMatch(mini,/\+'đ'/);
  assert.doesNotMatch(mini,/0đ/);
});

test('customer chat money formatter keeps literal values and omits the currency suffix',()=>{
  const money=latestFunction('taphoa_chat_money');
  const balance=latestFunction('taphoa_chat_balance_label');
  assert.doesNotMatch(money,/\/\s*1000/);
  assert.doesNotMatch(money,/\|\|\s*'đ'/);
  assert.doesNotMatch(balance,/0đ/);
});
