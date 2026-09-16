import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const startup=fs.readFileSync(new URL('../src/fixed-startup-nonblocking.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../src/fixed-production-start-owner.js',import.meta.url),'utf8');

test('external UI libraries do not block parsing of the FIXED app shell',()=>{
  for(const url of [
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/@phosphor-icons/web',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  ]){
    const re=new RegExp(`<script[^>]*\\sasync[^>]*src=["']${url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]*><\\/script>`,'i');
    assert.match(index,re,`${url} must load asynchronously so it cannot stop app parsing`);
  }
});

test('preview onload is neutralized before production override owns startup',()=>{
  const neutralizer=index.indexOf('window.onload=null');
  const override=index.indexOf('fixed-production-overrides.js');
  const ownerScript=index.indexOf('fixed-production-start-owner.js');
  assert.ok(neutralizer>0,'index must explicitly neutralize the FIXED preview onload');
  assert.ok(override>neutralizer,'preview onload must be neutralized before production override loads');
  assert.ok(ownerScript>override,'production owner must capture the override bootstrap after it loads');
});

test('production owner captures only the real production onload then clears it',()=>{
  assert.match(owner,/const boot=window\.onload/);
  assert.match(owner,/TAPHOA_FIXED_PRODUCTION_BOOT/);
  assert.match(owner,/window\.onload=null/);
  assert.match(owner,/taphoa-fixed-production-ready/);
});

test('production startup waits for both DOM and the real production bridge',()=>{
  assert.match(startup,/DOMContentLoaded/);
  assert.match(startup,/taphoa-production-bridge-ready/);
  assert.match(startup,/taphoa-fixed-production-ready/);
  assert.match(startup,/TAPHOA_FIXED_PRODUCTION_BOOT/);
  assert.doesNotMatch(startup,/const boot=window\.onload/,'startup must not capture the preview window.onload handler');
});
