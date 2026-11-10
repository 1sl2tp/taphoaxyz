import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const source=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const from=source.indexOf('const stamp=order.delivered_at||order.ngay||order.created_at;');
const to=source.indexOf('\n    const mapped=',from);
assert.ok(from>0&&to>from,'real portrait timestamp owner must be present');
const project=source.slice(from,to);
const code=`
const order={delivered_at:'2026-11-09T17:07:00+00:00',ngay:'2026-11-08T12:00:00Z',created_at:'2026-11-07T12:00:00Z'};
${project}
console.log(stampText);
`;
test('bill PNG uses delivery instant in Vietnam on browser/PWA hosts regardless of device zone',()=>{
  for(const tz of ['Asia/Ho_Chi_Minh','Etc/UTC','America/Los_Angeles','Pacific/Honolulu','Asia/Tokyo']){
    const output=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ:tz},encoding:'utf8'});
    assert.equal(output.status,0,`${tz}: ${output.stderr}`);
    assert.equal(output.stdout.trim(),'00:07 10/11/2026',tz);
  }
});
test('bill source never formats order notice image using host timezone implicitly',()=>{
  assert.ok(project.includes("timeZone:'Asia/Ho_Chi_Minh'"));
  assert.match(project,/hourCycle:'h23'/);
});
