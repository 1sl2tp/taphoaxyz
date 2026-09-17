import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const markup=await readFile('src/fixed-ui-markup-5.js','utf8');

test('source delete confirmation renders above source picker',()=>{
  assert.match(markup,/z-\[140\][^\"]*\\" id=\\"productEditorSourcePickerModal\\"/);
  assert.match(markup,/z-\[160\][^\"]*\\" id=\\"confirmModal\\"/);
});
