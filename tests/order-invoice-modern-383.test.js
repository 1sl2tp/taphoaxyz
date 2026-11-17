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
  const ctx=()=>({
    font:'',fillStyle:'',strokeStyle:'',lineWidth:1,textAlign:'',textBaseline:'',
    measureText(value){return {width:Array.from(String(value??'')).length*7};},
    setTransform(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
    lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},
    fillText(value,x,y){labels.push({text:String(value),x,y});}
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
  return {renderer:window.TAPHOA_ORDER_PORTRAIT,labels,appended};
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
