import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const behavior = readFileSync(new URL('../src/fixed-ui-behavior.js', import.meta.url), 'utf8');
const markup1 = readFileSync(new URL('../src/fixed-ui-markup-1.js', import.meta.url), 'utf8');
const markup5 = readFileSync(new URL('../src/fixed-ui-markup-5.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('browser suggestions are disabled across TAPHOA editable fields', () => {
  assert.match(behavior, /function applyTaphoaNoSuggestionPolicy\(/);
  assert.match(behavior, /setAttribute\('autocomplete', 'off'\)/);
  assert.match(behavior, /setAttribute\('autocorrect', 'off'\)/);
  assert.match(behavior, /setAttribute\('autocapitalize', 'off'\)/);
  assert.match(behavior, /setAttribute\('spellcheck', 'false'\)/);
  assert.match(behavior, /new MutationObserver\(/);
  assert.match(markup1, /id=\\?"searchProductInput\\?"[^\n]*autocomplete=\\?"off\\?"/i);
  assert.match(markup1, /searchProductInput[^\n]*autocorrect=\\?"off\\?"/i);
  assert.match(markup5, /customerSearchInput[^\n]*autocorrect=\\?"off\\?"/i);
  assert.match(index, /fixed-ui-behavior\.js\?v=no-browser-suggestions-20261004/);
});
