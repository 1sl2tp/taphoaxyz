import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('production loads debt/header regression runtime after the stable login bootstrap',()=>{
  const bootstrap=indexHtml.indexOf('fixed-cutover-bootstrap.js');
  const helper=indexHtml.indexOf('fixed-ui-regressions.js');
  const regression=indexHtml.indexOf('fixed-regression-overrides.js');

  assert.ok(bootstrap>=0,'stable login bootstrap must remain wired');
  assert.ok(helper>bootstrap,'regression helper must load after stable login bootstrap');
  assert.ok(regression>helper,'regression runtime must load after its helper');
});
