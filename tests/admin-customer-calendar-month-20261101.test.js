import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const report=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=report.indexOf('  const day=v=>');
const end=report.indexOf('  function periodVisibility(){',start);
assert.ok(start>=0&&end>start,'reportPeriod helper boundaries');

function period(selector,utcToday,dates={}){
  const controls={carePeriod:{value:selector},carePeriodStart:{value:dates.start||''},carePeriodEnd:{value:dates.end||''}};
  class FixedDate extends Date{
    constructor(...args){super(...(args.length?args:[utcToday]));}
    static now(){return new Date(utcToday).getTime();}
  }
  const context=vm.createContext({controls,Date:FixedDate,Intl});
  vm.runInContext(`
    const $=id=>controls[id];
    ${report.slice(start,end)}
    globalThis.period=reportPeriod();
  `,context);
  return JSON.parse(JSON.stringify(context.period));
}

test('month preset choices are visible and default to the current calendar month',()=>{
 const options=page.match(/<select id="carePeriod"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
 assert.match(options,/<option value="month_0" selected>Tháng này<\/option>/);
 assert.match(options,/<option value="month_1">Tháng trước<\/option>/);
 assert.match(options,/<option value="month_2">2 tháng trước<\/option>/);
 assert.match(options,/<option value="month_3">3 tháng trước<\/option>/);
 for(const value of ['all','7','30','90','custom'])assert.match(options,new RegExp('value="'+value+'"'));
});
test('this month runs from local first day through Vietnam today, not full future month',()=>{
 const p=period('month_0','2026-11-01T00:30:00Z');
 assert.equal(p.p_start_date,'2026-11-01');
 assert.equal(p.p_end_date,'2026-11-01');
 assert.match(p.label,/Tháng này · 11\/2026/);
});
test('last month spans the previous complete calendar month, not 30 rolling days',()=>{
 const p=period('month_1','2026-11-01T03:30:00Z');
 assert.deepEqual([p.p_start_date,p.p_end_date],['2026-10-01','2026-10-31']);
 assert.match(p.label,/Tháng trước · 10\/2026/);
});
test('older monthly options cross year boundaries correctly in January',()=>{
 const two=period('month_2','2027-01-10T11:30:00Z');
 const three=period('month_3','2027-01-10T11:30:00Z');
 assert.deepEqual([two.p_start_date,two.p_end_date],['2026-11-01','2026-11-30']);
 assert.deepEqual([three.p_start_date,three.p_end_date],['2026-10-01','2026-10-31']);
});
test('February leap year and non-leap year end dates are accurate',()=>{
 const leap=period('month_1','2024-03-02T00:00:00Z');
 const regular=period('month_1','2025-03-02T00:00:00Z');
 assert.equal(leap.p_end_date,'2024-02-29');
 assert.equal(regular.p_end_date,'2025-02-28');
});
test('relative-day, lifetime and custom periods retain existing behavior',()=>{
 assert.deepEqual([period('30','2026-11-01T00:00:00Z').p_start_date,period('30','2026-11-01T00:00:00Z').p_end_date],['2026-10-03','2026-11-01']);
 assert.deepEqual([period('all','2026-11-01T00:00:00Z').p_start_date,period('all','2026-11-01T00:00:00Z').p_end_date],[null,null]);
 assert.deepEqual([period('custom','2026-11-01T00:00:00Z',{start:'2026-09-06',end:'2026-09-30'}).p_start_date,period('custom','2026-11-01T00:00:00Z',{start:'2026-09-06',end:'2026-09-30'}).p_end_date],['2026-09-06','2026-09-30']);
});
