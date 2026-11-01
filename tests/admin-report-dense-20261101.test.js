import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('customer report keeps identity visible while inspecting money columns',()=>{
  assert.match(admin,/SPEC-ADMIN-FINAL-DENSITY-20261101/);
  assert.match(admin,/#customerCarePane \.care-list th:first-child\{position:sticky;left:0/);
  assert.match(admin,/#customerCarePane \.care-list td:first-child\{position:sticky;left:0/);
});
test('selected price choice is visible but does not form a heavy two-pixel stripe',()=>{
  assert.match(admin,/#goodsPane \.price-choice\.selected\{background:#eff6ff!important;color:#1e40af;box-shadow:inset 0 0 0 1px #93c5fd\}/);
});
