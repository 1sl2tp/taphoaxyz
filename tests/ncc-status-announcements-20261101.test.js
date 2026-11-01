import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
test('NCC status announcements are accessible and keep their existing IDs',()=>{
 for(const id of ['loginMsg','appMsg','ordersSummary']){
  const opening=page.match(new RegExp('<div id="'+id+'"[^>]*>'))?.[0];
  assert.ok(opening,id+' status node missing');
  assert.match(opening,/role="status"/);
  assert.match(opening,/aria-live="polite"/);
  assert.match(opening,/aria-atomic="true"/);
 }
});
