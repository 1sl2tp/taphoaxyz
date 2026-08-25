import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT} from '../src/contracts/ui-structure.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Auth Root matches semantic tree',()=>{
  const result=auditMarkupStructure(html,AUTH_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('App Root has Navigation, Screen Host and System Layer siblings',()=>{
  const result=auditMarkupStructure(html,APP_STRUCTURE_CONTRACT);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('remember copy matches username-only persistence',()=>{
  assert.match(html,/Nhớ tên đăng nhập/);
  assert.doesNotMatch(html,/Lưu mật khẩu/);
});

test('existing runtime control IDs stay stable',()=>{
  for(const id of ['loginForm','loginUsername','loginPassword','loginEye','loginRemember','loginError','loginSubmit','loginScreen','appShell','appNav','screenHost','systemToast']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
});
