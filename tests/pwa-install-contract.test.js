import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('PWA is branded Bán Hàng and installable on Android/iOS', () => {
  assert.equal(manifest.name, 'Bán Hàng');
  assert.equal(manifest.short_name, 'Bán Hàng');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(icon => icon.src === './src/assets/app-icon.svg' && icon.sizes === 'any'));

  assert.match(index, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);
  assert.match(index, /<meta\s+name="theme-color"\s+content="#16a34a">/);
  assert.match(index, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes">/);
  assert.match(index, /<meta\s+name="apple-mobile-web-app-title"\s+content="Bán Hàng">/);
  assert.match(index, /<link\s+rel="apple-touch-icon"\s+href="\.\/src\/assets\/logo\.jpg">/);
  assert.match(index, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
});
