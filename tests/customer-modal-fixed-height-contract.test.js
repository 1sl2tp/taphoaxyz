import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const markup = fs.readFileSync(new URL('../src/fixed-ui-markup-5.js', import.meta.url), 'utf8');

test('customer picker keeps a fixed modal height while filtering', () => {
  assert.ok(
    markup.includes('h-[80vh] max-h-[80vh]'),
    'customerBox must keep an explicit 80vh height so realtime search only changes the inner list'
  );
  assert.ok(markup.includes('id=\\"customerBox\\"'));
});
