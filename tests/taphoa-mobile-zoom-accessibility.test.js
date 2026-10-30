import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=['index.html','admin-gia.html','kh/index.html','bao-gia/index.html','ncc/index.html','kiemhang/index.html','ghi-chu/index.html'];
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
for(const file of pages){
 test('TAPHOA viewport pinch-zoom accessible: '+file,()=>{
  const html=read(file);
  const m=html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)/i);
  assert.ok(m,'viewport meta must exist on '+file);
  assert.match(m[1],/(?:^|[,\s])width=device-width(?:$|[,\s])/);
  assert.match(m[1],/(?:^|[,\s])initial-scale=1(?:\.0)?(?:$|[,\s])/);
  assert.doesNotMatch(m[1],/user-scalable\s*=\s*no/i,'never prohibit user zoom');
  assert.doesNotMatch(m[1],/maximum-scale\s*=\s*1(?:\.0)?(?:$|[,\s])/i,
   'never limit pinch zoom to initial scale');
 });
}
test('TAPHOA sales shell remains on existing production build owner',()=>{
 const html=read('index.html');
 assert.match(html,/TAPHOA_GEMINI_100_SAMPLE_FIXED/);
 assert.match(html,/fixed-production-bridge\.js/);
 assert.match(html,/name=["']viewport["']\s+content=["']width=device-width, initial-scale=1\.0, viewport-fit=cover/);
});
