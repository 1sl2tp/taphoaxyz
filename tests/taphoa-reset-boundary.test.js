import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915060000_reset_retired_taphoa_generic_data.sql',import.meta.url),'utf8');
const normalized=sql.replace(/--.*$/gm,' ').replace(/\s+/g,' ').trim();

const approvedDeletes=[
  'customer_product_summary',
  'customer_daily_summary',
  'customer_summary',
  'sessions',
  'debts',
  'order_items',
  'orders',
  'daily_summary',
  'products',
  'product_sources',
  'accounts'
];

test('reset deletes only the retired generic dependency graph in FK-safe order',()=>{
  let cursor=-1;
  for(const table of approvedDeletes){
    const statement=`delete from public.${table};`;
    const next=normalized.toLowerCase().indexOf(statement);
    assert.ok(next>=0,`missing ${statement}`);
    assert.ok(next>cursor,`${statement} must follow dependency order`);
    cursor=next;
  }

  const actual=[...normalized.matchAll(/delete\s+from\s+public\.([a-z0-9_]+)\s*;/ig)].map(match=>match[1].toLowerCase());
  assert.deepEqual(actual,approvedDeletes);
});

test('reset never mutates shared identity, Chat, or the new TAPHOA namespace',()=>{
  assert.doesNotMatch(sql,/\bv21_accounts\b|auth\.users|\bchat_/i);
  assert.doesNotMatch(sql,/(?:delete\s+from|truncate\s+table|update|drop\s+table)\s+public\.taphoa_/i);
  assert.doesNotMatch(sql,/drop\s+schema|\bcascade\b/i);
});

test('reset uses explicit deletes rather than broad truncate/cascade operations',()=>{
  assert.doesNotMatch(sql,/\btruncate\b/i);
  assert.doesNotMatch(sql,/\bcascade\b/i);
});
