import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const capture=read('src/fixed-ui-share-capture.js');
const cart=read('src/fixed-ui-cart-share-v3.js');
const debt=read('src/fixed-ui-runtime-12.js');
const source=read('src/fixed-ui-runtime-10.js');
const publicOrder=read('src/fixed-ui-public-order-image.js');
const save=read('src/fixed-ui-image-save.js');

function fixture(){
 const calls=[];
 const window={
  html2canvas:async(_target,options)=>{
   calls.push(options);
   const canvas={
    width:Math.ceil(options.width*options.scale),
    height:Math.ceil(options.height*options.scale),
    toBlob(callback,contentType){
     assert.equal(contentType,'image/png');
     callback(new Blob(['lossless-png-bytes'],{type:'image/png'}));
    }
   };
   return canvas;
  }
 };
 const ctx=vm.createContext({window,document:{},Promise,Number,Math,Error,setTimeout,clearTimeout,Blob});
 vm.runInContext(capture,ctx);
 return {capture:window.TAPHOA_SHARE_CAPTURE,calls};
}
const target={
 scrollWidth:440,scrollHeight:1200,
 getBoundingClientRect:()=>({width:440,height:1200})
};

test('downloaded 440px order/export PNG is at least 1000px wide when its content is ordinary length',async()=>{
 const {capture,calls}=fixture();
 const canvas=await capture.captureElement(target,{width:440,height:1200,scale:2.5});
 assert.equal(calls.length,1);
 assert.equal(calls[0].scale,2.5);
 assert.equal(canvas.width,1100);
 assert.equal(canvas.height,3000);
 const blob=await capture.canvasToPngBlob(canvas);
 assert.equal(blob.type,'image/png');
 assert.ok(blob.size>0);
 assert.equal(canvas.width,1,'release canvas memory after PNG is encoded');
 assert.equal(canvas.height,1);
});

test('source summary at 760px and 1800px tall keeps high-DPI text with bounded pixel area',async()=>{
 const {capture,calls}=fixture();
 const canvas=await capture.captureElement(target,{width:760,height:1800,scale:2.5});
 assert.equal(canvas.width,1900);
 assert.equal(canvas.height,4500);
 assert.ok(canvas.width*canvas.height<=16000000);
 assert.equal(calls[0].width,760,'DOM table remains the same CSS width');
});

test('long debt history preserves complete content without exceeding Chat 20kpx or iOS 16MP canvas budget',async()=>{
 const {capture,calls}=fixture();
 const canvas=await capture.captureElement(target,{width:440,height:14000,scale:2.5});
 assert.ok(canvas.height<=20000,'Chat metadata max image dimension');
 assert.ok(canvas.width*canvas.height<=16000000,'browser memory budget');
 assert.equal(calls[0].height,14000,'no cropping of debt history');
 assert.ok(calls[0].scale>1,'scale never silently falls below readable native width');
});

test('impossible oversized capture fails closed instead of writing a blurry or cropped screenshot',async()=>{
 const {capture,calls}=fixture();
 await assert.rejects(capture.captureElement(target,{width:5000,height:5000,scale:2.5}),/Nội dung quá dài/);
 assert.equal(calls.length,0);
});

test('saved-order, debt, source and public invoice all use high-DPI PNG source, not a low-res post-upscale',()=>{
 assert.match(cart,/scale:2\.5,\s*renderTimeout:16000/);
 assert.match(debt,/scale:\s*2\.5,\s*renderTimeout:\s*16000/);
 assert.match(source,/scale:2\.5,\s*renderTimeout:16000/);
 assert.match(publicOrder,/scale:2\.5,\s*renderTimeout:16000/);
 assert.ok(capture.includes('Math.sqrt(16000000/(width*height))'));
 assert.ok(capture.includes('20000/height'));
 assert.ok(capture.includes('8192/width'));
 assert.ok(!capture.includes('Math.min(1.5'));
 assert.match(save,/anchor\.download=safeName/,'desktop direct PNG download');
 assert.match(cart,/capture\.canvasToPngBlob\(canvas,errorMessage\)/,'no JPEG recompression on save');
});

test('same visual content and financial document contracts are retained',()=>{
 assert.match(cart,/portrait\.createPage\(/);
 assert.match(publicOrder,/portrait\.createPage\(/);
 assert.match(debt,/createCustomerDebtPngBlob/);
 assert.match(cart,/totalPriceText:displayRoundedTotal\(totalPrice\)/);
 assert.match(cart,/prepareDetailClone\(source\)/);
});
