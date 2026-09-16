import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const direct=fs.readFileSync(new URL('../src/fixed-production-direct-startup.js',import.meta.url),'utf8');

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
  const directScript=index.indexOf('fixed-production-direct-startup.js');
  assert.ok(neutralizer>0,'index must explicitly neutralize the FIXED preview onload');
  assert.ok(override>neutralizer,'preview onload must be neutralized before production override loads');
  assert.ok(directScript>override,'direct production startup must load after the override defines the real bootstrap');
});

test('direct production startup owns one nonblocking bootstrap path',()=>{
  assert.match(direct,/const boot=window\.onload/);
  assert.match(direct,/window\.onload=null/);
  assert.match(direct,/DOMContentLoaded/);
  assert.match(direct,/import\(['"]\.\/fixed-production-bridge\.js['"]\)/);
  assert.match(direct,/await boot\(\)/);
  assert.match(direct,/setTimeout/);
  assert.doesNotMatch(index,/fixed-production-start-owner\.js/);
  assert.doesNotMatch(index,/fixed-startup-nonblocking\.js/);
});
