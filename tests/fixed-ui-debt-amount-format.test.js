import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const markup2=fs.readFileSync(new URL('../src/fixed-ui-markup-2.js',import.meta.url),'utf8');
const markup4=fs.readFileSync(new URL('../src/fixed-ui-markup-4.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/fixed-ui-runtime-7.js',import.meta.url),'utf8');

test('debt amount fields use numeric keyboard but allow formatted thousands separators',()=>{
  assert.match(markup2,/id=\\\"quickDebtAmount\\\"[^\n]*inputmode=\\\"numeric\\\"[^\n]*type=\\\"text\\\"/);
  assert.match(markup4,/id=\\\"popupDebtAmount\\\"[^\n]*inputmode=\\\"numeric\\\"[^\n]*type=\\\"text\\\"/);
  assert.doesNotMatch(markup2,/id=\\\"quickDebtAmount\\\"[^\n]*type=\\\"number\\\"/);
  assert.doesNotMatch(markup4,/id=\\\"popupDebtAmount\\\"[^\n]*type=\\\"number\\\"/);
});

test('typing 4611 is displayed as 4.611 while submit parsing returns 4611',()=>{
  assert.match(runtime,/function formatDebtAmountValue\(value\)/);
  assert.match(runtime,/replace\(\/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)\/g, '\.'\)/);
  assert.match(runtime,/function parseDebtAmountValue\(value\)/);
  assert.match(runtime,/replace\(\/\\D\/g, ''\)/);
  assert.match(runtime,/let amount = parseDebtAmountValue\(amountStr\);/);

  const format=value=>{
    const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    return digits?digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
  };
  const parse=value=>{
    const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    return digits?Number(digits):0;
  };
  assert.equal(format('4611'),'4.611');
  assert.equal(parse('4.611'),4611);
});


test('production override parses formatted debt input as whole thousand units',()=>{
  const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
  assert.match(overrides,/typeof parseDebtAmountValue==='function'/);
  assert.match(overrides,/parseDebtAmountValue\(amountStr\)/);
  assert.doesNotMatch(overrides,/const amount=Number\(amountStr\)\|\|0;/);
});


test('backend rejects fractional debt amounts from stale formatted clients',()=>{
  const migrationsDir=new URL('../supabase/migrations/',import.meta.url);
  const names=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
  const sql=names.map(name=>fs.readFileSync(new URL(name,migrationsDir),'utf8')).join('\n\n').toLowerCase();
  const marker='create or replace function public.taphoa_debt_transaction';
  const start=sql.lastIndexOf(marker);
  assert.notEqual(start,-1);
  const end=sql.indexOf('$$;',start);
  const fn=sql.slice(start,end+3);
  assert.match(fn,/p_amount<>trunc\(p_amount\)/);
  assert.match(fn,/amount_must_be_whole_thousand/);
});
