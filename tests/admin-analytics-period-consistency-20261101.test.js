import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-ANALYTICS-FILTER-CONSISTENCY-20261101:');
const end=page.indexOf('    async function loadQuoteAnalytics(force=false){',start);
assert.ok(start>=0&&end>start,'analytics invalidation helper');
test('changing visit-report range clears old figures before dispatching the new request',()=>{
 const nodes={};
 for(const id of ['analyticsTotal','analyticsToday','analyticsWeek','analyticsUnique'])
   nodes[id]={textContent:'123'};
 for(const id of ['analyticsDailyBody','analyticsRecentBody'])
   nodes[id]={cleared:false,replaceChildren(){this.cleared=true;}};
 nodes.analyticsStatus={textContent:'Đang xem 30 ngày'};
 const state={nodes};
 const ctx=vm.createContext({state});
 vm.runInContext(`
   let analyticsLoaded=true;
   const $=id=>state.nodes[id];
   ${page.slice(start,end)}
   globalThis.api={invalidateQuoteAnalytics,loaded:()=>analyticsLoaded};
 `,ctx);
 ctx.api.invalidateQuoteAnalytics();
 assert.equal(ctx.api.loaded(),false);
 for(const id of ['analyticsTotal','analyticsToday','analyticsWeek','analyticsUnique'])
   assert.equal(nodes[id].textContent,'—');
 for(const id of ['analyticsDailyBody','analyticsRecentBody'])
   assert.equal(nodes[id].cleared,true);
 assert.match(nodes.analyticsStatus.textContent,/Đang cập nhật kỳ báo cáo/);
});
test('business labels distinguish lifetime and fixed-today from the selected period',()=>{
 assert.match(page,/Tổng lượt · toàn thời gian/);
 assert.match(page,/Lượt mở · hôm nay/);
 assert.match(page,/Lượt mở · 7 ngày/);
 assert.match(page,/Trình duyệt · trong kỳ lọc/);
 assert.match(page,/\$\('analyticsDays'\)\.addEventListener\('change',\(\)=>\{\s*invalidateQuoteAnalytics\(\);loadQuoteAnalytics\(true\)/);
});
