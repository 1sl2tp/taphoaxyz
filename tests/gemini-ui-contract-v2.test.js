import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Gemini production decorator skins all four production screens',()=>{
  const decorator=fs.readFileSync(new URL('../src/core/gemini-production-ui.js',import.meta.url),'utf8');
  for(const screen of ['sales','delivered','pending','debt']){
    assert.match(decorator,new RegExp(`dataset\\.screenId==='${screen}'`),`${screen} must be decorated`);
  }
  assert.match(decorator,/taphoa-gemini-screen/);
  assert.match(decorator,/taphoa-gemini-toolbar/);
  assert.match(decorator,/taphoa-gemini-card/);

  const ui=fs.readFileSync(new URL('../src/styles/gemini-ui.css',import.meta.url),'utf8');
  assert.match(ui,/\.taphoa-gemini-screen/);
  assert.match(ui,/\.taphoa-gemini-toolbar/);
  assert.match(ui,/\.taphoa-gemini-card/);

  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/src\/styles\/gemini-ui\.css/);
  assert.match(index,/src\/core\/gemini-production-ui\.js/);
});

test('business mutation API remains wired to existing production commands',()=>{
  const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
  for(const command of ['taphoa_save_order','taphoa_deliver_order','taphoa_reverse_order','taphoa_delete_pending_order','taphoa_debt_transaction']){
    assert.match(business,new RegExp(command));
  }
});
