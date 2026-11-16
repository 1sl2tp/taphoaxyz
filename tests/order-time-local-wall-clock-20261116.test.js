import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const a=source.indexOf('function viTime(value){');
const b=source.indexOf('\nfunction currentUid()',a);
const c=source.indexOf('function orderStatus(order){');
const d=source.indexOf('\nfunction backendOrderId(',c);
assert(a>=0&&b>a&&c>=0&&d>c,'Expected canonical source owners');
const runner=String.raw`
  const text=x=>String(x??'');
  const first=(o,keys,fallback='')=>{
    for(const key of keys)if(o&&o[key]!==undefined&&o[key]!==null&&o[key]!=='')return o[key];
    return fallback;
  };
` + source.slice(a,b) + '\n' + source.slice(c,d) + String.raw`
const result={
 naive:viTime('2026-11-16 06:40:00'),
 naiveIso:viTime('2026-11-16T23:59:59'),
 vietnamese:viTime('16/11/2026 06:40'),
 zoneAware:viTime('2026-11-15T17:00:00Z'),
 offset:viTime('2026-11-16T06:40:00+07:00'),
 midnight:viTime('2026-11-16T17:00:00+00:00'),
 pending:orderTime({status:'pending',ngay:'2026-11-16 06:40:00',created_at:'2026-11-15T15:00:00Z'}),
 delivered:orderTime({status:'done',delivered_at:'2026-11-16T01:05:00Z',ngay:'2026-11-13T01:05:00Z'}),
 missing:orderTime({status:'pending'}),
 missingDelivered:orderTime({status:'done'}),
 partial:viTime('2026-11-16')
};
console.log(JSON.stringify(result));
`;
test('Đơn tạm / Đã giao: local wall clock does not shift across browser/server timezones',()=>{
  for(const zone of ['Asia/Ho_Chi_Minh','Etc/UTC','America/Los_Angeles','Pacific/Honolulu','Asia/Tokyo']){
    const r=spawnSync(process.execPath,['-e',runner],{encoding:'utf8',env:{...process.env,TZ:zone}});
    assert.equal(r.status,0,zone+': '+r.stderr);
    const x=JSON.parse(r.stdout.trim());
    assert.equal(x.naive,'16/11/2026 06:40:00',zone);
    assert.equal(x.naiveIso,'16/11/2026 23:59:59',zone);
    assert.equal(x.vietnamese,'16/11/2026 06:40:00',zone);
    assert.equal(x.zoneAware,'16/11/2026 00:00:00',zone);
    assert.equal(x.offset,'16/11/2026 06:40:00',zone);
    assert.equal(x.midnight,'17/11/2026 00:00:00',zone);
    assert.equal(x.pending,'16/11/2026 06:40:00',zone);
    assert.equal(x.delivered,'16/11/2026 08:05:00',zone);
    assert.equal(x.missing,'Chưa rõ thời gian',zone);
    assert.equal(x.missingDelivered,'Chưa rõ thời gian',zone);
    assert.equal(x.partial,'16/11/2026',zone);
  }
});
