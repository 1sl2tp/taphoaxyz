import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// ORDER-UI-383: test the actual shared HTML/Canvas source, not a second
// rendering implementation. No browser networking or order mutations.
const source=fs.readFileSync('src/fixed-ui-portrait-order.js','utf8');
function createHarness(){
  const labels=[];
  const appended=[];
  const rectangles=[];
  const ctx=()=>({
    font:'',fillStyle:'',strokeStyle:'',lineWidth:1,textAlign:'',textBaseline:'',
    measureText(value){return {width:Array.from(String(value??'')).length*7};},
    setTransform(){},fillRect(x,y,w,h){rectangles.push({x,y,w,h,color:this.fillStyle});},strokeRect(){},beginPath(){},moveTo(){},
    lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},
    fillText(value,x,y){labels.push({text:String(value),x,y,align:this.textAlign});}
  });
  const document={
    body:{appendChild(node){appended.push(node);}},
    createElement(name){
      if(name==='canvas')return {width:0,height:0,getContext(){return ctx();}};
      return {style:{},setAttribute(){},appendChild(){},innerHTML:''};
    }
  };
  const window={};
  vm.runInNewContext(source,{document,window});
  return {renderer:window.TAPHOA_ORDER_PORTRAIT,labels,appended,rectangles};
}
const example={
  customer:'E Quyên dv',orderId:'DG399',time:'17/11/2026 20:58',
  isDraft:false,items:[{index:1,name:'Sua chua co',qtyText:'5',
    priceText:'275',totalText:'1.375',note:''}],
  lineCount:1,totalQty:5,totalPriceText:'1.375'
};

test('approved modern invoice renders identical immutable order fields for HTML and Canvas PNG',()=>{
  const {renderer,labels}=createHarness();
  const view=renderer.createPage(example);
  const canvas=renderer.renderCanvas(example,1.2);
  const html=view.page.innerHTML;
  const text=labels.map(x=>x.text).join('|');
  for(const field of ['HÓA ĐƠN BÁN HÀNG','E Quyên dv','DG399',
    'Sua chua co','275','1.375','1 mã · 5 sản phẩm','Tổng thanh toán']){
    assert.ok(text.includes(field),'Canvas missing '+field);
    assert.ok(html.includes(field),'HTML missing '+field);
  }
  assert.ok(html.includes('background:#203c52'),'subdued navy header missing');
  assert.ok(html.includes('color:#226c49'),'professional green total text missing');
  assert.ok(html.includes('margin:12px 22px 16px'),'footer must share 22px ruler');
  assert.doesNotMatch(html,/background:#268b4b/,'total should not look like a button');
  assert.equal(canvas.width,528);
  assert.ok(canvas.height>canvas.width,'receipt must be portrait');
  const ordered=['STT','TÊN','SL','ĐG','TIỀN'];
  const rendered=labels.map(x=>x.text);
  for(let i=1;i<ordered.length;i++)
    assert.ok(rendered.indexOf(ordered[i])>rendered.indexOf(ordered[i-1]),'misordered invoice columns');
});

test('draft and continuation page labels do not invent a final payment or status',()=>{
  const {renderer,labels}=createHarness();
  const draft={...example,isDraft:true,orderId:'DT269',isLastPage:false,
    totalPriceText:'1.050',items:[{index:1,name:'Sua chua star trang x',
      qtyText:'5',priceText:'210',totalText:'1.050'}]};
  const html=renderer.createPage(draft).page.innerHTML;
  const png=renderer.renderCanvas(draft);
  const output=labels.map(x=>x.text);
  assert.ok(html.includes('ĐƠN HÀNG TẠM'));
  assert.ok(html.includes('Còn tiếp…'));
  assert.ok(!html.includes('Tổng thanh toán'));
  assert.ok(output.includes('ĐƠN HÀNG TẠM'));
  assert.ok(output.includes('Còn tiếp…'));
  assert.ok(!output.includes('Tổng thanh toán'));
  assert.ok(png.height>0);
});

test('long customer and product names wrap, preserving original numeric labels and notes',()=>{
  const {renderer,labels}=createHarness();
  const data={...example,customer:'Khách hàng có tên rất dài cần được xuống dòng rõ ràng',
    items:[{index:1,name:'Sản phẩm tên dài chứa tiếng Việt và nhiều từ cần xuống dòng trên điện thoại',
      qtyText:'125',priceText:'1.250',totalText:'156.250',note:'Ghi chú riêng'}],
    totalQty:125,totalPriceText:'156.250'};
  const png=renderer.renderCanvas(data);
  const html=renderer.createPage(data).page.innerHTML;
  assert.ok(png.height>540,'long content should increase portrait height');
  assert.ok(labels.some(x=>x.text==='156.250'));
  assert.ok(html.includes('Ghi chú riêng'));
  assert.ok(html.includes('125'));
  assert.ok(html.includes('1.250'));
  assert.ok(html.includes('156.250'));
});

test('renderer remains purely visual with one canonical entrypoint',()=>{
  assert.match(source,/Object\.freeze\(\{WIDTH,MIN_HEIGHT,createPage,renderCanvas\}\)/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\bpostMessage\s*\(|\btaphoa_debt_ledger\b/);
  assert.match(source,/milkXInfo\(item\)/);
  assert.match(source,/font-variant-numeric:tabular-nums/);
});

test('ORDER-UI-386 prints four continuous vertical separators between five columns in both HTML and PNG',()=>{
  const {renderer,rectangles,labels}=createHarness();
  const data={...example,templateId:'print',items:[
    {index:1,name:'Mì chính bát 454 *',qtyText:'10',priceText:'1.265',totalText:'12.650'},
    {index:2,name:'Mì chính bát 1*',qtyText:'20',priceText:'935',totalText:'18.700'}
  ],lineCount:2,totalQty:30,totalPriceText:'31.350'};
  const html=renderer.createPage(data).page.innerHTML;
  assert.match(html,/data-invoice-grid="five-columns"/);
  const columnRules=[...html.matchAll(/data-invoice-grid-rule="column"[^>]*left:([0-9.]+)px;width:1px/g)]
    .map(match=>Number(match[1]));
  assert.equal(columnRules.length,4,'STT | TÊN | SL | ĐG | TIỀN needs 4 vertical rules');
  assert(columnRules.every((x,index)=>index===0||x>columnRules[index-1]+10),
    'all rules must occupy separate grid gaps');
  assert.match(html,/data-invoice-grid-rule="outline"/,'outline must surround actual rows');
  assert.match(html,/height:44px;border-bottom:1px solid/,'table heading is separated');
  renderer.renderCanvas(data,1);
  const verticals=rectangles.filter(rect=>rect.w===1&&rect.h>170&&rect.y>170&&rect.y<400);
  assert.equal(verticals.length,6,'PNG includes four separators plus left and right frame');
  const inner=verticals.filter(rect=>rect.x>22&&rect.x<417).map(rect=>rect.x-22);
  assert.equal(inner.length,4);
  assert(inner.every((x,index)=>index===0||x>inner[index-1]+10));
  assert(labels.some(x=>x.text==='31.350'),'divider must not alter the source total');
  assert(labels.some(x=>x.text==='18.700'),'divider must not clip/recompute row amounts');
});


test('ORDER-UI-387: centered STT/SL and inset money labels align across HTML and offline PNG',()=>{
  const {renderer,labels,rectangles}=createHarness();
  const order={
    customer:'A Hậu Còi',orderId:'DG430',time:'20/11/2026 11:12',
    templateId:'print',isDraft:false,items:[
      {index:1,name:'Mi chinh bat 1*',qtyText:'5',priceText:'935',totalText:'4.675'},
      {index:2,name:'Mi chinh bat 454 *',qtyText:'5',priceText:'1.265',totalText:'6.325'},
      {index:3,name:'Mi chinh bat 1.8*',qtyText:'5',priceText:'1.080',totalText:'5.400'}
    ],lineCount:3,totalQty:15,totalPriceText:'16.400'
  };
  const html=renderer.createPage(order).page.innerHTML;
  const canvas=renderer.renderCanvas(order,1);
  const rules=[...html.matchAll(/data-invoice-grid-rule="column"[^>]*left:([0-9.]+)px;width:1px/g)]
    .map(match=>22+Number(match[1]));
  const pngRules=rectangles
    .filter(r=>r.w===1&&r.h>170&&r.y>170&&r.y<430)
    .map(r=>r.x).sort((a,b)=>a-b);
  assert.equal(rules.length,4,'the 5-column table needs 4 divider gaps');
  assert.deepEqual(pngRules,[22,...rules,417],
    'HTML and PNG must use the same four dividers and outer frame');
  assert.match(html,/grid-template-columns:38px minmax\(0,1fr\)/,
    'the STT track must be wide enough for its centered caption');
  assert.match(fs.readFileSync('index.html','utf8'),
    /invoice-insets=20261120-387/,'Web/PWA must request the new invoice renderer');
  assert.equal((html.match(/padding-right:9px;box-sizing:border-box/g)||[]).length,8,
    'HTML price and total cells need inset on header + all three rows');

  const heading=name=>labels.find(x=>x.text===name&&x.y>180&&x.y<250);
  const stt=heading('STT'),qty=heading('SL');
  const price=heading('ĐG'),total=heading('TIỀN');
  assert(stt&&qty&&price&&total,'invoice headings should exist in PNG');
  assert.equal(stt.align,'center');
  assert(stt.x-22>=18,'STT must have room between its center and outer frame');
  assert.equal(qty.align,'center');
  assert.equal(qty.x,(rules[1]+rules[2])/2,
    'SL must sit at the exact center between its left and right rules');
  assert.equal(price.align,'right');
  assert.equal(total.align,'right');
  assert(rules[3]-price.x>=14,'unit price must not touch the right-hand divider');
  assert.equal(418-total.x,9,'amount must have a 9px right inset from the frame');

  const rows=labels.filter(x=>x.y>250&&x.y<500);
  assert.equal(rows.filter(x=>x.text==='5'&&x.align==='center'&&x.x===qty.x).length,3,
    'all row quantities must match the SL heading center');
  for(const value of ['935','1.265','1.080']){
    assert(rows.some(x=>x.text===value&&x.align==='right'&&x.x===price.x),
      'unit prices must share the right-inset ruler: '+value);
  }
  for(const value of ['4.675','6.325','5.400']){
    assert(rows.some(x=>x.text===value&&x.align==='right'&&x.x===total.x),
      'row totals must share the same right-inset ruler: '+value);
    assert(html.includes(value),'HTML must keep the original amount: '+value);
  }
  assert(labels.some(x=>x.text==='16.400'),
    'summary total must remain sourced, never recomputed');
  assert(canvas.width===440&&canvas.height>canvas.width,
    'paper size is unchanged and still portrait');
});
