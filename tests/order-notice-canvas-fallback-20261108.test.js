import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const portrait=readFileSync('src/fixed-ui-portrait-order.js','utf8');
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
const share=readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
const shell=readFileSync('index.html','utf8');

function canvasHarness(){
  const words=[],rects=[];
  const ctx={
    setTransform(){},
    fillRect(...args){rects.push(args);},
    fillText(value){words.push(String(value));},
    measureText(value){return {width:Array.from(String(value)).length*6.8};},
    font:'',textBaseline:'',textAlign:'',fillStyle:''
  };
  const document={
    createElement(name){
      if(name!=='canvas')throw Error('Unexpected external DOM requirement: '+name);
      return {width:0,height:0,getContext(type){assert.equal(type,'2d');return ctx;}};
    }
  };
  const window={};
  vm.runInNewContext(portrait,{document,window});
  return {api:window.TAPHOA_ORDER_PORTRAIT,words,rects};
}
const row=(name,qty,price,note='')=>({
  name,qtyText:String(qty),priceText:String(price),
  totalText:String(qty*price),note
});
test('offline renderer includes every order row and customer-visible totals',()=>{
  const h=canvasHarness();
  const order=h.api.renderCanvas({
    orderId:'DG296',customer:'C Toan ts',time:'16:31 08/11/2026',
    isDraft:false,items:[
      row('Sữa tươi Vinamilk',3,100),
      row('Mì gói bò',5,40,'Khách nhận trước 17h'),
      row('Bánh gạo',5,23)
    ],lineCount:3,totalQty:13,totalPriceText:'615'
  },1.2);
  assert.equal(order.width,528);
  assert.ok(order.height>=744);
  const text=h.words.join(' | ');
  for(const piece of ['Mã đơn: DG296','C Toan ts','Sữa tươi Vinamilk','Mì gói bò',
    'Khách nhận trước 17h','Bánh gạo','3 mã · 13 sản phẩm','615']){
    assert.ok(text.includes(piece),piece);
  }
  assert.ok(h.rects.length>=5);
});
test('saved draft uses DT label and does not use external image/CDN',()=>{
  const h=canvasHarness();
  h.api.renderCanvas({orderId:'DT42',isDraft:true,customer:'C Sam',
    items:[row('Thùng sữa',2,350)],lineCount:1,totalQty:2,totalPriceText:'700'});
  assert.ok(h.words.includes('Đơn tạm: DT42'));
  const method=portrait.slice(portrait.indexOf('function renderCanvas('));
  assert.doesNotMatch(method,/fetch\s*\(|import\s*\(|https?:\/\//);
});
test('too many saved-order lines fail instead of truncating bill or using wrong total',()=>{
  const h=canvasHarness();
  const items=Array.from({length:131},(_,i)=>row('Hàng '+i,1,100));
  assert.throws(()=>h.api.renderCanvas({items}),/order_png_items_invalid/);
});
test('verified notices attach on Web, PWA and WebView without multiplying messages',()=>{
  assert.match(bridge,/portrait\.renderCanvas\(portraitOptions,1\.2\)/);
  assert.match(bridge,/taphoa_order_notice_image_ticket/);
  assert.match(bridge,/taphoa_order_notice_image_attach/);
  assert.match(bridge,/const pngWidth=canvas\.width/);
  assert.match(bridge,/const pngHeight=canvas\.height/);
  assert.match(bridge,/const blob=capture\?\.canvasToPngBlob/);
  assert.match(bridge,/result\.image_attached=await attachOrderNoticePortrait\(result\.order\)===true/g);
  assert.match(bridge,/attachOrderNoticePortrait\(response\.order,\{manual:true\}\)/);
  assert.match(bridge,/manual===true&&state==='pending'/);
  assert.doesNotMatch(bridge,/insert into\s+taphoa_orders|insert into\s+v21_messages/i);
  assert.match(share,/prod\.manualShareOrder\(orderId,crypto\.randomUUID\(\)\)/);
  assert.match(shell,/order-png=20261108/);
});
