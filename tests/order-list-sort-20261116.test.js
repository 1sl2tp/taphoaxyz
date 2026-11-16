import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-ORDER-LIST-SORT-20261116. Sorting only changes displayed order,
// never saved DG/DT IDs, item rows, accounting, or time filter source.
const src=readFileSync('src/fixed-ui-runtime-7.js','utf8');
const renderDelivered=readFileSync('src/fixed-ui-runtime-11.js','utf8');
const renderDraft=readFileSync('src/fixed-ui-runtime-10.js','utf8');
const shim=readFileSync('src/fixed-ui-behavior.js','utf8');
const html=readFileSync('index.html','utf8');
const start=src.indexOf('        function orderTimelineStamp(value) {');
const end=src.indexOf('        function getUserTimelineVisibleKeys(',start);
assert(start>0&&end>start,'canonical order sort functions must exist');
const context={
  Intl,
  parseOrderDateKey(s){
    const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';
  }
};
vm.createContext(context);
vm.runInContext(src.slice(start,end),context);
const sort=(sheet,orders)=>Array.from(context.sortOrderKeysForDisplay(sheet,orders));

test('delivered orders sort by displayed VN delivery date/time, not DG number',()=>{
  const orders={
    DG8:{tenKh:'C Hùng',thoiGian:'16/11/2026 12:15:00'},
    DG7:{tenKh:'C Trường',thoiGian:'16/11/2026 11:25:00'},
    DG6:{tenKh:'E Toàn',thoiGian:'16/11/2026 12:25:00'},
    DG5:{tenKh:'C Ngoan',thoiGian:'16/11/2026 12:26:00'},
    DG4:{tenKh:'C Trang',thoiGian:'15/11/2026 23:59:00'}
  };
  assert.deepEqual(sort('dongiao',orders),['DG5','DG6','DG8','DG7','DG4']);
  assert.deepEqual(Object.keys(orders),['DG8','DG7','DG6','DG5','DG4'],'input untouched');
});
test('same timestamp and unknown times stay deterministic by original order code',()=>{
  const orders={
    DG4:{thoiGian:'16/11/2026 12:00:00'},
    DG15:{thoiGian:'16/11/2026 12:00:00'},
    DG1:{thoiGian:'Chưa rõ thời gian'}
  };
  assert.deepEqual(sort('dongiao',orders),['DG15','DG4','DG1']);
});
test('draft orders sort by Vietnamese buyer name, regardless of creation time',()=>{
  const orders={
    DT105:{tenKh:'C Trường',thoiGian:'16/11/2026 11:50'},
    DT2:{tenKh:'Ánh',thoiGian:'15/11/2026 13:00'},
    DT75:{tenKh:'Bình',thoiGian:'16/11/2026 12:20'},
    DT10:{tenKh:'C Hà',thoiGian:'16/11/2026 12:30'},
    DT9:{tenKh:'c Hà',thoiGian:'16/11/2026 10:30'}
  };
  assert.deepEqual(sort('dontam',orders),['DT2','DT75','DT10','DT9','DT105']);
});
test('only correct tab calls canonical sort; no late DOM reordering or badge overwrite',()=>{
  assert.match(renderDelivered,/sortOrderKeysForDisplay\('dongiao', orders\)/);
  assert.match(renderDraft,/sortOrderKeysForDisplay\('dontam', orders\)/);
  assert.doesNotMatch(shim,/stabilizeNewestOrderCards\(/);
  assert.doesNotMatch(shim,/numberBadge\.textContent/);
  assert.match(renderDelivered,/renderUserOrderDayHeading/,'delivered day grouping kept');
  assert.doesNotMatch(renderDraft,/renderUserOrderDayHeading/,'alphabetized drafts are one list');
  assert.match(html,/src\/fixed-ui-runtime-7\.js[^"]*list-sort=20261116/);
  assert.match(html,/src\/fixed-ui-behavior\.js[^"]*list-sort=20261116/);
});
