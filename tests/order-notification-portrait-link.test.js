import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const bridge=fs.readFileSync('src/fixed-production-bridge.js','utf8');
test('order notifications attach a real PNG to their existing text and link',()=>{
  assert.match(bridge,/async function attachOrderNoticePortrait\(order\)/);
  assert.match(bridge,/taphoa_order_notice_image_ticket/);
  assert.match(bridge,/if\(!ticket\?\.ok\)return/);
  assert.match(bridge,/TAPHOA_ORDER_PORTRAIT/);
  assert.match(bridge,/TAPHOA_SHARE_CAPTURE/);
  assert.match(bridge,/storage\.from\('v21-media'\)\.upload/);
  assert.match(bridge,/taphoa_order_notice_image_attach/);
  assert.match(bridge,/if\(!publicAccess&&!employeeAccess\)void attachOrderNoticePortrait\(result\?\.order\)/);
  assert.match(bridge,/void attachOrderNoticePortrait\(result\?\.order\)/);
  assert.match(bridge,/\['done','delivered'\]/);
  assert.doesNotMatch(bridge,/createElement\('img'\).*send/);
});

test('portrait PNG size is saved before release of canvas memory',()=>{
  assert.match(bridge,/const pngWidth=canvas\.width;/);
  assert.match(bridge,/const pngHeight=canvas\.height;/);
  assert.match(bridge,/p_width_px:pngWidth,p_height_px:pngHeight/);
  assert.doesNotMatch(bridge,/p_width_px:canvas\.width,p_height_px:canvas\.height/);
});
