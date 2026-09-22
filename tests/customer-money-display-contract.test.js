import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const no=fs.readFileSync(new URL('../no/index.html',import.meta.url),'utf8');
const quote=fs.readFileSync(new URL('../b/index.html',import.meta.url),'utf8');
const order=fs.readFileSync(new URL('../d/index.html',import.meta.url),'utf8');
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
  assert.match(no,/var n=Math\.abs\(Number\(v\)\|\|0\);/);
  assert.match(quote,/format\(n\)/);
  assert.match(order,/format\(Math\.abs\(Number\(v\)\|\|0\)\)/);
  assert.doesNotMatch(no,/\/1000/);
  assert.doesNotMatch(quote,/\/1000/);
  assert.doesNotMatch(order,/\/1000/);
  assert.doesNotMatch(no,/\+'đ'/);
  assert.doesNotMatch(no,/text:'0đ'/);
});

test('customer chat money formatter keeps literal values and omits the currency suffix',()=>{
  const money=latestFunction('taphoa_chat_money');
  const balance=latestFunction('taphoa_chat_balance_label');
  assert.doesNotMatch(money,/\/\s*1000/);
  assert.doesNotMatch(money,/\|\|\s*'đ'/);
  assert.doesNotMatch(balance,/0đ/);
});
