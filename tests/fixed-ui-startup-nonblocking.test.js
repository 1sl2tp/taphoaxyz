import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

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

test('production bootstrap starts at DOM readiness instead of waiting for window load',()=>{
  assert.doesNotMatch(overrides,/window\.onload\s*=/,'startup must not wait for every external asset');
  assert.match(overrides,/DOMContentLoaded/,'startup must begin when the DOM is ready');
});
