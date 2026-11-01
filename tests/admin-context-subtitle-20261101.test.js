import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('business-specific admin header does not show price-edit language on reports',()=>{
 assert.match(html,/id="adminPageSubtitle"/);
 assert.match(html,/\['goods','goodsTabBtn','Quản trị hàng hóa','Tự lưu khi sửa/);
 assert.match(html,/\['customers','customerCareTabBtn','Báo cáo khách hàng','Đơn đã giao trong kỳ · công nợ hiện tại'\]/);
 assert.match(html,/\['analytics','analyticsTabBtn','Báo cáo lượt truy cập','Số lần xem trang báo giá · không phải số khách mua'\]/);
 assert.match(html,/subtitle\.textContent=tabConfiguration\.find\(x=>x\[0\]===adminView\)\[3\]/);
});
