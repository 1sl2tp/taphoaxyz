import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// MILK-X-371: the PNG sent to Chat/Zalo must highlight the actual suffix
// letter X and the matching SL, not just the editable cart CSS.
const source=readFileSync('src/fixed-ui-portrait-order.js','utf8');
function harness(){
  const glyphs=[];
  const ctx={
    font:'',fillStyle:'',textAlign:'',textBaseline:'',
    setTransform(){},fillRect(){},
    fillText(value,x,y){glyphs.push({value:String(value),color:this.fillStyle,x,y});},
    measureText(value){return {width:Array.from(String(value)).length*7};}
  };
  const node=()=>({style:{},innerHTML:'',setAttribute(){},appendChild(){}});
  const document={
    createElement(tag){return tag==='canvas'?{width:0,height:0,getContext:()=>ctx}:node();},
    body:{appendChild(){}}
  };
  const window={};
  vm.runInNewContext(source,{window,document});
  return {api:window.TAPHOA_ORDER_PORTRAIT,glyphs};
}
const order=items=>({
  orderId:'DG370',customer:'C Hà Trang',time:'11:32 16/11/2026',
  items:items.map(({name,qty,group})=>({
    name,qtyText:String(qty),priceText:'410',totalText:String(qty*410),group
  })),lineCount:items.length,totalQty:items.reduce((s,i)=>s+i.qty,0),
  totalPriceText:'0'
});
test('receipt Canvas paints only milk suffix X and corresponding quantity red',()=>{
  const h=harness();
  h.api.renderCanvas(order([
    {name:'Sữa bò lít ít x',qty:1},
    {name:'Sua chua co X',qty:3},
    {name:'Sữa bò lít thường',qty:5},
    {name:'Mì xào x',qty:2},
    {name:'Probi vị dâu x',qty:4}
  ]));
  const red=h.glyphs.filter(g=>g.color==='#dc2626');
  assert.equal(red.filter(g=>/^[xX]$/.test(g.value)).length,3);
  for(const q of ['1','3','4'])assert(red.some(g=>g.value===q));
  assert(!red.some(g=>g.value==='5'||g.value==='2'));
  assert(h.glyphs.some(g=>g.value==='Mì xào x'&&g.color==='#142238'));
});
test('HTML fallback uses identical suffix and quantity styling',()=>{
  const h=harness();
  const page=h.api.createPage(order([
    {name:'Sữa bò lít ít x',qty:1},
    {name:'Bánh gạo x',qty:2}
  ])).page.innerHTML;
  assert.match(page,/Sữa bò lít ít <span style="color:#dc2626;">x<\/span>/);
  assert.match(page,/font-weight:750;color:#dc2626/);
  assert.match(page,/Bánh gạo x<\/div>/);
  assert(!page.includes('Bánh gạo <span style="color:#dc2626;">'));
});
