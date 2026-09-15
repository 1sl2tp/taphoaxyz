import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rules=readFileSync(new URL('../docs/TAPHOA_QUY_TAC_LAM_VIEC.txt',import.meta.url),'utf8');
const required=[
  'AUTH ROOT / APP ROOT',
  'SLOT 1 / SLOT 2 / SLOT 3',
  'SEMANTIC TREE / PLACEMENT TREE',
  'REGION CONTRACT',
  'PARENT–CHILD CONTRACT',
  'NAMING / CODE ORDER CONTRACT',
  'FUNCTION FLOW CONTRACT',
  'SCROLL / FOCUS / KEYBOARD CONTRACT',
  'STRUCTURE GATE'
];

test('single TAPHOA rule source contains the approved structural guardrail',()=>{
  for(const token of required)assert.ok(rules.includes(token),`missing ${token}`);
});

test('Auth remains outside business Screen tree',()=>{
  assert.match(rules,/Login\/Auth.+không phải Screen nghiệp vụ/s);
  assert.match(rules,/Auth Root.+App Root.+thay thế nhau/s);
});

test('remember-user rule never becomes password persistence',()=>{
  assert.match(rules,/Nhớ tên đăng nhập/);
  assert.match(rules,/không lưu password|không lưu mật khẩu/i);
});
