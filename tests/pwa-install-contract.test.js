import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('PWA is branded Bán Hàng and uses separate favicon and app icons', () => {
  assert.equal(manifest.name, 'Bán Hàng');
  assert.equal(manifest.short_name, 'Bán Hàng');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(icon => icon.src === './src/assets/app-icon-192-v3.png' && icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.src === './src/assets/app-icon-512-v3.png' && icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.src === './src/assets/app-icon-maskable-512-v3.png' && icon.sizes === '512x512' && icon.purpose === 'maskable'));
  assert.ok(!manifest.icons.some(icon => String(icon.src || '').includes('logo.jpg')));
  assert.ok(!manifest.icons.some(icon => String(icon.src || '').includes('favicon.svg')));

  assert.match(index, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);
  assert.match(index, /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\.\/src\/assets\/favicon\.svg">/);
  assert.match(index, /<link\s+rel="shortcut icon"\s+type="image\/svg\+xml"\s+href="\.\/src\/assets\/favicon\.svg">/);
  assert.match(index, /<link\s+rel="mask-icon"\s+href="\.\/src\/assets\/favicon\.svg"\s+color="#16a34a">/);
  assert.match(index, /<meta\s+name="theme-color"\s+content="#16a34a">/);
  assert.match(index, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes">/);
  assert.match(index, /<meta\s+name="apple-mobile-web-app-title"\s+content="Bán Hàng">/);
  assert.match(index, /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="\.\/src\/assets\/app-icon-180-v3\.png">/);
  assert.ok(!index.includes('logo.jpg'));
  assert.match(index, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
});
