import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('receipt image sharing loads html2canvas before application modules',()=>{
  const canvas=html.indexOf('html2canvas.min.js');
  const app=html.indexOf('./src/app.js');
  assert.ok(canvas>=0,'html2canvas runtime is missing');
  assert.ok(app>canvas,'html2canvas must load before app modules');
});
