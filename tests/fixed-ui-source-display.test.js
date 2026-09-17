import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('product source column uses source display name while preserving internal source key',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/function\s+sourceDisplayName\s*\(/);
  assert.match(bridge,/state\.sources/);
  assert.match(bridge,/first\(source,\['name','ten'\]/);
  assert.match(bridge,/sourceDisplayName\(p,state\)/);
});
