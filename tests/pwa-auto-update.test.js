import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('installed PWA actively checks for a fresh build and service worker on launch',async()=>{
  const [html,updater,sw,version,build]=await Promise.all([
    readFile('index.html','utf8'),
    readFile('src/fixed-pwa-auto-update.js','utf8'),
    readFile('sw.js','utf8'),
    readFile('version.json','utf8'),
    readFile('scripts/build-current.mjs','utf8')
  ]);

  assert.match(html,/fixed-pwa-auto-update\.js\?v=pwa-auto-update-20260921/);
  assert.doesNotMatch(html,/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);

  assert.match(updater,/updateViaCache:'none'/);
  assert.match(updater,/registration\.update\(\)/);
  assert.match(updater,/fetchServerVersion/);
  assert.match(updater,/cache:'no-store'/);
  assert.match(updater,/serverBuild===runningBuild/);
  assert.match(updater,/url\.searchParams\.set\(BUILD_QUERY,targetBuild\)/);
  assert.match(updater,/navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(updater,/window\.addEventListener\('pageshow'/);
  assert.match(updater,/document\.addEventListener\('visibilitychange'/);
  assert.match(updater,/attempts>=3/);
  assert.match(updater,/hasLiveCart\(\)/);

  assert.match(sw,/taphoa-runtime-v35/);
  assert.match(sw,/self\.skipWaiting\(\)/);
  assert.match(sw,/self\.clients\.claim\(\)/);

  const parsedVersion=JSON.parse(version);
  assert.equal(parsedVersion.update_policy,'active-build-check-on-launch');
  assert.equal(parsedVersion.ui_fix,'pwa-active-auto-update');

  assert.match(build,/const buildId=\`content-\$\{digest\.digest\('hex'\)\.slice\(0,20\)\}\`/);
  assert.match(build,/version\.build_id=buildId/);
  assert.match(build,/index=index\.replace/);
});
