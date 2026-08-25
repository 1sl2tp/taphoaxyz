import test from 'node:test';
import assert from 'node:assert/strict';
import {SCREEN_IDS,SCREEN_REGISTRY,NAV_ITEMS} from '../src/core/screen-registry.js';
import {normalizeRoute} from '../src/core/router.js';

test('registry contains exactly four approved Screens',()=>{
  assert.deepEqual(SCREEN_IDS,['sales','delivered','pending','debt']);
  assert.deepEqual(Object.keys(SCREEN_REGISTRY),SCREEN_IDS);
  assert.deepEqual(NAV_ITEMS.map(x=>x.id),SCREEN_IDS);
});

test('router accepts caller supplied Screen IDs',()=>{
  assert.equal(normalizeRoute('#debt',SCREEN_IDS),'debt');
  assert.equal(normalizeRoute('#unknown',SCREEN_IDS),'sales');
});
