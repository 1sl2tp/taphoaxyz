import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

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

test('stable production bootstrap is promoted from window load to DOM readiness',()=>{
  assert.match(index,/fixed-production-overrides\.js/,'stable production override remains the owner of login/bootstrap');
  assert.match(index,/fixed-startup-nonblocking\.js/,'nonblocking startup promoter must be wired');
  const startup=fs.readFileSync(new URL('../src/fixed-startup-nonblocking.js',import.meta.url),'utf8');
  assert.match(startup,/DOMContentLoaded/);
  assert.match(startup,/window\.onload\s*=\s*null/,'the later load event must not run bootstrap a second time');
});
