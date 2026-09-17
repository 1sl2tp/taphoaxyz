import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('settings no longer exposes the product editor UI', async () => {
  const settingsMarkup = await read('src/fixed-ui-markup-3.js');
  const productEditorMarkup = await read('src/fixed-ui-markup-5.js');

  assert.ok(!settingsMarkup.includes('Cập nhật sản phẩm'), 'settings still shows Cập nhật sản phẩm');
  assert.ok(!settingsMarkup.includes('openProductEditor()'), 'settings still links to product editor');
  assert.ok(!productEditorMarkup.includes('id=\\"productEditorPage\\"'), 'product editor page markup still exists');
  assert.ok(!productEditorMarkup.includes('id=\\"productEditorSourcePickerModal\\"'), 'product editor source picker still exists');
  assert.ok(!productEditorMarkup.includes('id=\\"productEditorAddSourceModal\\"'), 'product editor add-source modal still exists');
});
