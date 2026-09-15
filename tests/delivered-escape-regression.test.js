import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredMarkup} from '../src/screens/delivered.js';

test('delivered detail escapes double quotes with a complete HTML entity',()=>{
  const html=deliveredMarkup({selected:{id:'D1',tenKH:'Khách "A"',ngay:'2026-09-15T12:00:00',tongTien:0,items:[]},permissions:{}});
  assert.match(html,/Khách &quot;A&quot;/);
  assert.doesNotMatch(html,/&quotA/);
});
