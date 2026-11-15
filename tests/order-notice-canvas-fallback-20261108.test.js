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
  assert.ok(order.height>=450&&order.height<=720,
    'two or three rows must remain compact without huge blank footer');
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

test('UI-PORTRAIT-019: names and money are legible in a short five-column receipt',()=>{
  const words=[];
  const ctx={
    font:'',textAlign:'',textBaseline:'',fillStyle:'',
    setTransform(){},fillRect(){},
    fillText(value,x,y){words.push({value:String(value),font:this.font,x,y,align:this.textAlign});},
    measureText(value){
      const match=this.font.match(/(\\d+(?:\\.\\d+)?)px/);
      const px=match?Number(match[1]):12;
      return {width:Array.from(String(value)).length*px*.53};
    }
  };
  const document={createElement(){
    return {width:0,height:0,getContext:()=>ctx};
  }};
  const window={};
  vm.runInNewContext(portrait,{document,window});
  const canvas=window.TAPHOA_ORDER_PORTRAIT.renderCanvas({
    orderId:'DG361',customer:'C Hoa Mễ',time:'15:20 15/11/2026',
    items:[row('Bat 1kg *',5,955),row('Sua ensua re *',20,975)],
    lineCount:2,totalQty:25,totalPriceText:'24.275'
  },1.2);
  assert.equal(canvas.width,528);
  assert.ok(canvas.height<690,'a two-item receipt must fit on a phone without excess white space');
  const name=words.find(w=>w.value==='Sua ensua re *');
  assert(name&&/1[57]px/.test(name.font),'product names must be 15-17px');
  const money=words.find(w=>w.value==='19.500');
  assert(!money,'source must preserve supplied row totals, not fabricate them');
  const amount=words.find(w=>w.value==='24.275');
  assert(amount&&/2[0-8]px/.test(amount.font),'grand total must be prominent');
  const price=words.find(w=>w.value==='975');
  assert(price&&/1[2-6]px/.test(price.font),'unit prices must be readable');
  const header=words.find(w=>w.value==='Mã đơn: DG361');
  assert(header&&header.font.includes('14px'));
  for(const val of ['STT','TÊN','SL','ĐG','TIỀN','Bat 1kg *','Sua ensua re *'])
    assert(words.some(w=>w.value===val),'lost required receipt text '+val);
  assert.equal(words.find(w=>w.value==='ĐG').x,
    words.find(w=>w.value==='975').x,'price header/body must align');
  assert.equal(words.find(w=>w.value==='TIỀN').x,
    words.find(w=>w.value==='4775').x,'amount header/body must align');
});

test('UI-PORTRAIT-020: ordinary DG header is exactly two visual rows with full timestamp',()=>{
  const rendered=[];
  const paint={
    font:'',textBaseline:'',textAlign:'',fillStyle:'',
    setTransform(){},fillRect(){},
    fillText(value,x,y){rendered.push({value:String(value),x,y,align:this.textAlign});},
    measureText(value){
      const px=Number(this.font.match(/(\\d+(?:\\.\\d+)?)px/)?.[1]||14);
      return {width:Array.from(String(value)).length*px*.53};
    }
  };
  const document={createElement:()=>({width:0,height:0,getContext:()=>paint})};
  const window={};
  vm.runInNewContext(portrait,{document,window});
  const fullTime='15/11/2026 15:39:16';
  const image=window.TAPHOA_ORDER_PORTRAIT.renderCanvas({
    orderId:'DG363',customer:'Bác Thơm Lễ',time:fullTime,
    items:[row('Sua ensua re *',50,980),row('Bat 1kg *',8,955)],
    lineCount:2,totalQty:58,totalPriceText:'56.640'
  },1.2);
  const code=rendered.find(x=>x.value==='Mã đơn: DG363');
  const time=rendered.find(x=>x.value===fullTime);
  const customer=rendered.find(x=>x.value==='Bác Thơm Lễ');
  assert(code&&time&&customer);
  assert.equal(code.y,time.y,'code and timestamp should share the first header row');
  assert(customer.y>code.y,'customer should occupy the second header row');
  assert(customer.y<68,'avoid old third line and large header');
  assert.equal(time.align,'right');
  assert(image.height<520,'short two-line receipt should not waste height');
  assert.equal(rendered.filter(x=>x.value.startsWith('Thời gian:')).length,0,
    'date is kept but verbose label should not take another line');
});

test('UI-PORTRAIT-020: oversized metadata stacks deliberately without clipping',()=>{
  const rendered=[];
  const ctx={
    font:'',textAlign:'',textBaseline:'',fillStyle:'',
    setTransform(){},fillRect(){},
    fillText(value,x,y){rendered.push({value:String(value),x,y});},
    measureText(value){
      const px=Number(this.font.match(/(\\d+(?:\\.\\d+)?)px/)?.[1]||14);
      return {width:Array.from(String(value)).length*px*.65};
    }
  };
  const window={};
  const document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
  vm.runInNewContext(portrait,{document,window});
  window.TAPHOA_ORDER_PORTRAIT.renderCanvas({
    orderId:'DG-2026-11-15-EXTENDED',time:'15/11/2026 15:39:16',
    customer:'Chị Khách Hàng Có Tên Dài Nhiều Từ Ở Hà Nội',
    items:[row('Sữa hộp',2,350)],lineCount:1,totalQty:2,totalPriceText:'700'
  });
  const meta=rendered.find(x=>x.value.startsWith('Mã đơn:'));
  const time=rendered.find(x=>x.value==='15/11/2026 15:39:16');
  assert(meta&&time);
  assert(time.y>meta.y,'very long codes must not collide with the timestamp');
  assert(rendered.some(x=>x.value.includes('Khách Hàng')),
    'long customer names must still be visible');
});
