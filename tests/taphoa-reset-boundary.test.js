import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915060000_reset_retired_taphoa_generic_data.sql',import.meta.url),'utf8');
const normalized=sql.replace(/--.*$/gm,' ').replace(/\s+/g,' ').trim();

test('reset targets only the six retired generic business tables',()=>{
  const expected=[
    'truncate table public.order_items;',
    'truncate table public.orders;',
    'truncate table public.debts;',
    'truncate table public.products;',
    'truncate table public.product_sources;',
    'truncate table public.accounts;'
  ];
  for(const statement of expected)assert.match(normalized,new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});

test('reset never touches shared identity, Chat, or the new TAPHOA namespace',()=>{
  assert.doesNotMatch(sql,/\bv21_accounts\b|auth\.users|\bchat_/i);
  assert.doesNotMatch(sql,/\btaphoa_(?:products|sources|orders|order_items|debt_ledger|revisions|sheet_sync_state)\b/i);
  assert.doesNotMatch(sql,/drop\s+schema|\bcascade\b/i);
});

test('reset contains no broad destructive statements',()=>{
  assert.doesNotMatch(sql,/truncate\s+table\s+(?!public\.(?:order_items|orders|debts|products|product_sources|accounts)\b)/i);
  assert.doesNotMatch(sql,/delete\s+from/i);
});
