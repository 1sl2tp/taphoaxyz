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

test('production has one explicit bootstrap owner and does not promote window.onload through a shim',()=>{
  assert.match(index,/fixed-production-overrides\.js/,'production override remains the owner of login/bootstrap');
  assert.doesNotMatch(index,/fixed-startup-nonblocking\.js/,'startup shim must not be loaded');
  assert.doesNotMatch(overrides,/window\.onload\s*=\s*async\s*function/,'production must not wait for window load');
  assert.match(overrides,/async function startProductionApp\(/,'production needs an explicit bootstrap function');
  assert.match(overrides,/DOMContentLoaded/,'production bootstrap must start when DOM is ready');
  assert.match(overrides,/taphoa-production-bridge-ready/,'production bootstrap must also wait for the bridge when needed');
  assert.match(overrides,/window\.TAPHOA_PRODUCTION/,'production bootstrap must verify the bridge exists before starting');
});
