import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const module=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261010080000_admin_customer_care_report.sql',import.meta.url),'utf8');
test('Admin opens customer report on demand without background polling',()=>{
 assert.match(page,/id="customerCareTabBtn"[^>]*>Báo cáo KH/);
 assert.match(page,/id="customerCarePane"/);
 assert.match(page,/customerCare\.load\(false\)/);
 assert.match(module,/taphoa_admin_customer_care_report/);
 assert.match(module,/identity\?\.role!=='admin'/);
 assert.doesNotMatch(module,/setInterval\(/);
});
test('customer segments, draft reason caution and copy-only are available',()=>{
 for(const key of ['careFilter','careSearch','careDetail','careCopySuggestion','careInactiveDays']) assert.match(page+module,new RegExp(key));
 assert.match(module,/chưa có lý do xác nhận chưa giao/);
 assert.match(module,/không tự gửi Chat\/Zalo/);
 assert.match(module,/t==='E'\?'Em':t==='C'\?'Chị':'Anh'/);
 assert.match(module,/Number\(r\.pending_count\)>0/);
 assert.match(module,/!Number\(r\.delivered_count\)/);
});
test('read-only report RPC is permission-gated and scoped to customer group',()=>{
 assert.match(sql,/public\.taphoa_access_context\(\)/);
 assert.match(sql,/taphoa_role',''\) <> 'admin'/);
 assert.match(sql,/contact_group='customer'/);
 assert.match(sql,/o\.status='pending'/);
 assert.match(sql,/o\.status='delivered'/);
 assert.match(sql,/lower\(c\.username\)='test'/);
 assert.match(sql,/revoke all on function public\.taphoa_admin_customer_care_report\(integer\) from public,anon/i);
 assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from|taphoa_chat_notify_customer)\b/i);
});
