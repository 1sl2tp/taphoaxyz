import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('admin-gia.html','utf8');
const js=fs.readFileSync('src/admin-customer-special-prices.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261116005500_admin_customer_special_price_columns.sql','utf8');
for(const marker of [
  'id="specialPriceToolbar"','id="specialPriceAddCustomer"','id="specialPriceRetry"',
  'id="specialPricePicker"','id="specialPricePickerSearch"',
  'createSpecialPriceColumns','specialPrices.render()','specialPrices.reset()'
])assert(html.includes(marker),marker);
assert(html.includes("specialPrices.mount();"));
assert(!html.includes('customer_special_prices from localStorage'));
assert(js.includes('const maxColumns=8'));
assert(js.includes('button.disabled=true;'));
assert(js.includes("error?.code==='PGRST202'"));
assert(js.includes('state.probeGeneration++'));
assert(js.includes('if(!state.ready){cleanOldColumns();return;}'));
assert(js.includes('void probe();'));
assert(html.includes('special-price-toolbar[hidden]'));
assert(js.includes('input.disabled=true; // Until a successful authorized read.'));
assert(js.includes("p_customer_ids:selected,p_product_codes:codes"));
assert(js.includes("p_price:number"));
assert(js.includes("if(!current(ctx))return"),"session fencing");
assert(js.includes("input.dataset.saved"),"cannot overwrite saved edit");
assert(js.includes("customerId+'|'+code"),"price keyed by customer & product");
assert(js.includes("dialog.showModal()"));
assert(!js.includes('localStorage'));
assert(js.includes('state.request++; // Every new page'));
assert(js.includes('async function flush()'));
assert(html.includes('specialPrices.syncOrder()'));
assert(html.includes('specialPrices.flush()'));
assert(sql.includes('PRIMARY KEY (customer_id, product_code)'));
assert(sql.includes('ENABLE ROW LEVEL SECURITY'));
assert(sql.includes('REVOKE ALL ON TABLE'));
assert(sql.includes("ctx->>'taphoa_role'<>'admin'"));
assert(sql.includes("a.contact_group='customer'"));
assert(sql.includes("p_price IS NULL"));
assert(sql.includes("v_product.input_price_vnd<=0"));
assert(!sql.includes('CREATE POLICY'));
assert(!sql.includes('public.taphoa_save_order('),"no live order pricing changes");
console.log('ADMIN-CP-001 selected customer columns / admin-only SQL / scoped saves PASS');
