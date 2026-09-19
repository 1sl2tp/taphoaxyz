import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const markup=fs.readFileSync(new URL('../src/fixed-ui-markup-1.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/fixed-login-polish.css',import.meta.url),'utf8');

test('login fields use div + label geometry instead of fieldset legend',()=>{
  assert.ok(!markup.includes('<fieldset class=\\\"login-outline-field'),'login must not use fieldset for outlined fields');
  assert.ok(!markup.includes('<legend class=\\\"login-outline-legend'),'login must not use legend for floating labels');
  assert.match(markup,/<div class=\\\"login-outline-field[^]*?<label class=\\\"login-outline-legend[^]*?for=\\\"loginUsername\\\">Tài khoản<\/label>/);
  assert.match(markup,/<label class=\\\"login-outline-legend[^]*?for=\\\"loginPassword\\\">Mật khẩu<\/label>/);
  assert.match(css,/box-sizing:border-box !important;/);
  assert.match(css,/#loginScreen \.login-outline-field:focus-within\{/);
  assert.match(css,/top:50% !important;[^]*transform:translateY\(-50%\) !important;/);
});
