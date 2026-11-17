import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const bridge=fs.readFileSync('src/fixed-production-bridge.js','utf8');
test('order notifications attach a real PNG to the same message and link',()=>{
  assert.match(bridge,/async function attachOrderNoticePortrait\(order,\{manual=false,staffCommandId=null\}=\{\}\)/);
  assert.match(bridge,/taphoa_order_notice_image_ticket/);
  assert.match(bridge,/if\(!ticket\?\.ok\)return/);
  assert.match(bridge,/TAPHOA_ORDER_PORTRAIT/);
  assert.match(bridge,/TAPHOA_SHARE_CAPTURE/);
  assert.match(bridge,/storage\.from\('v21-media'\)\.upload/);
  assert.match(bridge,/taphoa_order_notice_image_attach/);
  assert.match(bridge,/result\.image_attached=await attachOrderNoticePortrait\(result\.order\)===true/);
  assert.match(bridge,/const mediaTask=\['done','delivered'\]\.includes\(savedStatus\)&&result\?\.order/);
  assert.match(bridge,/attachCommittedOrderNotices\(result,result\.staff_notice_command_id\)/);
  assert.match(bridge,/portrait\.renderCanvas\(portraitOptions,1\.2\)/);
  assert.match(bridge,/\['done','delivered'\]/);
  assert.match(bridge,/manual===true&&state==='pending'/);
  assert.match(bridge,/attachOrderNoticePortrait\(response\.order,\{manual:true\}\)/);
  assert.doesNotMatch(bridge,/\['pending','done','delivered'\]/);
  assert.doesNotMatch(bridge,/createElement\('img'\).*send/);
});

test('portrait PNG size is saved before release of canvas memory',()=>{
  assert.match(bridge,/const pngWidth=canvas\.width;/);
  assert.match(bridge,/const pngHeight=canvas\.height;/);
  assert.match(bridge,/p_width_px:pngWidth,p_height_px:pngHeight/);
  assert.doesNotMatch(bridge,/p_width_px:canvas\.width,p_height_px:canvas\.height/);
});


test('manual share and automatic Chat notice use same Canvas2D portrait schema',async()=>{
  const share=fs.readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
  assert.match(bridge,/portrait\.renderCanvas\(portraitOptions,1\.2\)/);
  assert.match(share,/async function captureUnifiedOrderPng\(built,source,width,height,errorMessage\)/);
  assert.match(share,/portrait\.renderCanvas\(built\.portraitOptions,1\.2\)/);
  assert.match(share,/captureUnifiedOrderPng\(built,built\.capture,width,height/);
  assert.match(share,/captureUnifiedOrderPng\(built,built\.clone,built\.width,height/);
  assert.match(share,/return \{\.\.\.built,totalQty,totalPrice,meta,portraitOptions\}/);
  assert.match(share,/return \{\.\.\.portrait\.createPage\(portraitOptions\),portraitOptions\}/);
  // HTML capture is only a failure fallback; don't send duplicate PNGs.
  const start=share.indexOf('async function captureUnifiedOrderPng(');
  const end=share.indexOf('async function prepareCartShareCache(',start);
  const snippet=share.slice(start,end);
  assert(start>0&&end>start);
  const paint={width:528,height:429};
  let rendered=0,legacy=0;
  const renderCanvas=options=>{rendered++;assert.equal(options.orderId,'DG398');return paint;};
  const fn=new Function('window','canvasToPngBlob','console',
    snippet+'\nreturn captureUnifiedOrderPng;')(
      {TAPHOA_ORDER_PORTRAIT:{renderCanvas},
       TAPHOA_SHARE_CAPTURE:{canvasToPngBlob:async canvas=>{
         assert.equal(canvas,paint);return {type:'image/png',size:42};
       }}},
      async()=>{legacy++;return {type:'image/png',size:2};},
      {warn(){}}
    );
  const blob=await fn({portraitOptions:{orderId:'DG398'}},null,440,380,'Ảnh đơn');
  assert.equal(blob.size,42);assert.equal(rendered,1);assert.equal(legacy,0);
  assert.equal(paint.width,1);assert.equal(paint.height,1);
  const fallback=new Function('window','canvasToPngBlob','console',
    snippet+'\nreturn captureUnifiedOrderPng;')(
      {TAPHOA_ORDER_PORTRAIT:{renderCanvas(){throw Error('canvas_unavailable');}},
       TAPHOA_SHARE_CAPTURE:{canvasToPngBlob:async()=>{throw Error('must not export');}}},
      async()=>{legacy++;return {type:'image/png',size:7};},
      {warn(){}}
    );
  const recovered=await fallback({portraitOptions:{orderId:'DG398'}},{},440,380,'Ảnh đơn');
  assert.equal(recovered.size,7);assert.equal(legacy,1);
});
