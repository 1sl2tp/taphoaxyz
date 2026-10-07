import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('sales, cart and order detail keep bounded inner vertical scroll owners',async()=>{
  const css=await read('src/fixed-ui-source-1.css');
  const html=await read('index.html');

  assert.match(css,/#tab-ban-hang\s*>\s*main,\s*\n#cartItemList,\s*\n#detailModalItems,\s*\n#cDebtModalHistoryList\s*\{[\s\S]*?min-height:\s*0\s*!important;[\s\S]*?overflow-y:\s*auto\s*!important;/);
  assert.match(css,/#cartBottomSheet,\s*\n#orderDetailBottomSheet,\s*\n#customerDebtBottomSheet\s*\{[\s\S]*?min-height:\s*0\s*!important;[\s\S]*?overflow:\s*hidden\s*!important;/);
  assert.match(css,/-webkit-overflow-scrolling:\s*touch/);
  assert.match(html,/fixed-ui-source-1\.css\?v=scroll-owner-20261007/);
});
