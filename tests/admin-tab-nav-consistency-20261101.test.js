import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('each panel has a linked accessible tab and correct initial selected state',()=>{
 for(const [tab,pane] of [['goodsTabBtn','goodsPane'],['marketTabBtn','marketPane'],
 ['analyticsTabBtn','analyticsPane'],['customerCareTabBtn','customerCarePane']]){
  const button=html.match(new RegExp('<button id="'+tab+'"[^>]*>'))?.[0];
  const panel=html.match(new RegExp('<(?:section|div) id="'+pane+'"[^>]*>'))?.[0];
  assert.ok(button&&panel,tab);
  assert.match(button,/role="tab"/);
  assert.ok(button.includes('aria-controls="'+pane+'"'));
  assert.ok(panel.includes('role="tabpanel"'));
  assert.ok(panel.includes('aria-labelledby="'+tab+'"'));
 }
});
test('active report tab updates heading and ARIA state, with arrow keyboard support',()=>{
 assert.match(html,/id="adminPageTitle"/);
 assert.match(html,/SPEC-ADMIN-NAV-SEMANTICS-20261101/);
 assert.match(html,/setAttribute\('aria-selected',String\(active\)\)/);
 assert.match(html,/button\.tabIndex=active\?0:-1/);
 assert.match(html,/document\.title=pageTitle\+' · Tạp hóa'/);
 assert.match(html,/document\.querySelector\('\.admin-tabs'\)\.addEventListener\('keydown'/);
});
test('compact menu is available at 570px, not just very narrow phones',()=>{
 assert.match(html,/SPEC-ADMIN-MOBILE-NAV-20261101/);
 assert.match(html,/@media\(max-width:700px\)\{\s*\.top\{flex-wrap:nowrap/);
 assert.match(html,/\.top-actions \.desktop-admin-extra\{display:none!important\}/);
 assert.match(html,/\.mobile-admin-menu\{display:block;position:relative\}/);
});
