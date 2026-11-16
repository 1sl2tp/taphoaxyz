import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeSpecialPriceCustomers} from '../src/admin-customer-special-prices.js';

const user1='a1234567-1111-4111-8111-123456789aaa';
const user2='b1234567-1111-4111-8111-123456789bbb';
const user3='c1234567-1111-4111-8111-123456789ccc';
const sample=normalizeSpecialPriceCustomers([
  {id:user1,name:'Khách đang có giá riêng',price_count:23},
  {id:user2,name:'Khách dùng giá chung',price_count:0},
  {id:'bad-id',name:'Invalid',price_count:100},
  {id:user3,name:'Trường hợp lỗi',price_count:-9}
]);
assert.equal(sample.length,3);
assert.equal(sample[0].id,user1);
assert.equal(sample[0].price_count,23);
assert.equal(sample[1].price_count,0);
assert.equal(sample[2].price_count,0);
assert.throws(()=>normalizeSpecialPriceCustomers({}),/invalid_customer_list/);

const ui=fs.readFileSync('src/admin-customer-special-prices.js','utf8');
const html=fs.readFileSync('admin-gia.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261116012500_admin_customer_special_price_suggestions.sql','utf8');
assert(ui.includes("price_count>0"));
assert(ui.includes("priced.slice(0,8)"));
assert(ui.includes("state.selected.includes(id)"));
assert(ui.includes("if(!await flush())"));
assert(ui.includes("focusColumn(id)"));
assert(ui.includes("customer.price_count++"));
assert(ui.includes("customer.price_count=Math.max(0,customer.price_count-1)"));
assert(ui.includes("state.customers=normalizeSpecialPriceCustomers(data)"));
assert(ui.includes("aria-pressed"));
assert(html.includes('id="specialPriceSuggestionRow"'));
assert(html.includes('id="specialPriceSuggested"'));
assert(html.includes('Khách đã có giá riêng'));
assert(html.includes('admin-customer-special-prices.js?v=20261116cp003'));
assert(sql.includes("public.taphoa_access_context()"));
assert(sql.includes("ctx->>'taphoa_role'<>'admin'"));
assert(sql.includes('LEFT JOIN LATERAL'));
assert(sql.includes('count(*)::int AS price_count'));
assert(sql.includes('REVOKE ALL ON FUNCTION'));
assert(!/UPDATE\s+public\.taphoa_products/i.test(sql));
assert(!/\b(?:INSERT|DELETE|TRUNCATE)\s+(?:INTO|FROM)\s+public\./i.test(sql));
console.log('ADMIN-CP-002 quick suggestions / existing prices / admin gate PASS');
