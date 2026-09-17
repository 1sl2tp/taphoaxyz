import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const markup=await readFile('src/fixed-ui-markup-5.js','utf8');

test('source delete confirmation renders above source picker',()=>{
  assert.match(markup,/id=\\"productEditorSourcePickerModal\\"/);
  assert.match(markup,/productEditorSourcePickerModal[\s\S]*z-\[140\]/);
  assert.match(markup,/id=\\"confirmModal\\"/);
  assert.match(markup,/confirmModal[\s\S]*z-\[160\]/);
});
