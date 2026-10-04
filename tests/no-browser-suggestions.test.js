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
  const productSearchTag = markup1.match(/<input[^>]*id=\\?"searchProductInput\\?"[^>]*>/i)?.[0] || '';
  const customerSearchTag = markup5.match(/<input[^>]*id=\\?"customerSearchInput\\?"[^>]*>/i)?.[0] || '';
  assert.match(productSearchTag, /autocomplete=\\?"off\\?"/i);
  assert.match(productSearchTag, /autocorrect=\\?"off\\?"/i);
  assert.match(productSearchTag, /autocapitalize=\\?"off\\?"/i);
  assert.match(productSearchTag, /spellcheck=\\?"false\\?"/i);
  assert.match(customerSearchTag, /autocomplete=\\?"off\\?"/i);
  assert.match(customerSearchTag, /autocorrect=\\?"off\\?"/i);
  assert.match(index, /fixed-ui-behavior\.js\?v=no-browser-suggestions-20261004/);
});
