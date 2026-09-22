import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../b/index.html',import.meta.url),'utf8');
const low=html.toLowerCase();

test('app domain hosts the public quote page',()=>{
  for(const needle of [
    '<title>báo giá taphoa</title>',
    "params.get('kh')",
    'v21-quote',
    'id="quote-search"',
    'id="quote-source-filters"',
  ])assert.ok(low.includes(needle),needle);
  for(const forbidden of ['signin','login','localstorage','document.cookie'])assert.equal(low.includes(forbidden),false,forbidden);
});
