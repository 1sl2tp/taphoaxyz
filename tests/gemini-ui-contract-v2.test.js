import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const screens=['sales','delivered','pending','debt'];

test('production screens expose the TAPHOA Gemini UI contract',()=>{
  for(const screen of screens){
    const source=fs.readFileSync(new URL(`../src/screens/${screen}.js`,import.meta.url),'utf8');
    assert.match(source,/taphoa-gemini-screen/,`${screen} must use taphoa-gemini-screen`);
  }
  const ui=fs.readFileSync(new URL('../src/styles/gemini-ui.css',import.meta.url),'utf8');
  assert.match(ui,/\.taphoa-gemini-screen/);
  assert.match(ui,/\.taphoa-gemini-toolbar/);
  assert.match(ui,/\.taphoa-gemini-card/);
});

test('business mutation API remains wired to existing production commands',()=>{
  const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
  for(const command of ['taphoa_save_order','taphoa_deliver_order','taphoa_reverse_order','taphoa_delete_pending_order','taphoa_debt_transaction']){
    assert.match(business,new RegExp(command));
  }
});
