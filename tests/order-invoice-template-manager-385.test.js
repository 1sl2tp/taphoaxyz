import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync('src/fixed-ui-invoice-templates.js','utf8');
const renderSource=fs.readFileSync('src/fixed-ui-portrait-order.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const style=fs.readFileSync('src/fixed-ui-invoice-templates.css','utf8');

function harness({blockedStorage=false}={}){
  const map=new Map();
  const storage={
    getItem:key=>blockedStorage?(()=>{throw Error('denied');})():(map.get(key)||null),
    setItem:(key,value)=>{
      if(blockedStorage)throw Error('denied');
      map.set(key,String(value));
    }
  };
  const drawings=[];
  const canvasContext=()=>({
    font:'',textBaseline:'',textAlign:'',fillStyle:'',strokeStyle:'',lineWidth:1,
    setTransform(){},fillRect(x,y,w,h){drawings.push({type:'rect',color:this.fillStyle,x,y,w,h});},
    strokeRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},
    closePath(){},fill(){},measureText(value){return {width:Array.from(String(value??'')).length*7.2};},
    fillText(value,x,y){drawings.push({type:'text',value:String(value),color:this.fillStyle,x,y});}
  });
  const document={
    readyState:'loading',
    addEventListener(){},dispatchEvent(){},
    createElement(tag){
      if(tag==='canvas')return {width:0,height:0,getContext:()=>canvasContext()};
      return {style:{},setAttribute(){},appendChild(){},innerHTML:''};
    },
    body:{appendChild(){}}
  };
  const window={};
  class CustomEvent{constructor(name,options){this.type=name;this.detail=options?.detail;}}
  const sandbox={window,document,localStorage:storage,CustomEvent};
  vm.runInNewContext(registrySource,sandbox);
  vm.runInNewContext(renderSource,sandbox);
  return {api:window.TAPHOA_INVOICE_TEMPLATES,portrait:window.TAPHOA_ORDER_PORTRAIT,drawings,map};
}
const example={
  customer:'test',orderId:'DG400',time:'17/11/2026 21:38',isDraft:false,
  items:[{index:1,name:'555 bạc',qtyText:'1',priceText:'241',totalText:'241'},
         {index:2,name:'5*',qtyText:'1',priceText:'146',totalText:'146'}],
  lineCount:2,totalQty:2,totalPriceText:'387'
};

test('four variants share one immutable invoice structure, five numeric columns and actual source amounts',()=>{
  const h=harness();
  assert.equal(h.api.selected(),'print');
  for(const id of ['print','minimal','navy','sage']){
    const palette=h.api.paletteFor({templateId:id});
    const before=h.drawings.length;
    const canvas=h.portrait.renderCanvas({...example,templateId:id},1);
    const paints=h.drawings.slice(before);
    const html=h.portrait.createPage({...example,templateId:id}).page.innerHTML;
    assert.ok(canvas.height>canvas.width,'portrait output required');
    const header=paints.find(x=>x.type==='rect'&&x.x===0&&x.y===0&&x.w===440);
    assert.equal(header?.color,palette.header,id+' canvas header');
    assert.ok(html.includes('background:'+palette.header+';color:'+palette.headerText),id+' HTML header');
    assert.ok(html.includes('background:'+palette.table),id+' table header');
    assert.ok(html.includes('background:'+palette.footer),id+' summary');
    const texts=paints.filter(x=>x.type==='text').map(x=>x.value);
    for(const value of ['test','DG400','555 bạc','5*','1','241','146','387',
      'STT','TÊN','SL','ĐG','TIỀN','2 mã · 2 sản phẩm'])
      assert.ok(texts.includes(value),id+' missing '+value);
    assert.ok(paints.some(x=>x.type==='text'&&x.value==='387'&&x.color===palette.total),
      id+' changed or obscured total');
  }
});

test('Print Master uses real grayscale ink, white background, muted lines and no button total',()=>{
  const h=harness();
  const p=h.api.paletteFor({templateId:'print'});
  assert.equal(p.header,'#ffffff');
  assert.equal(p.headerText,'#171717');
  assert.equal(p.meta,'#ffffff');
  const html=h.portrait.createPage({...example,templateId:'print'}).page.innerHTML;
  assert.ok(html.includes('color:#171717'));
  assert.ok(html.includes('border-bottom:1px solid '+p.headerRule));
  assert.doesNotMatch(html,/background:#268b4b/);
  h.portrait.renderCanvas({...example,templateId:'print'});
  const t=h.drawings.find(x=>x.type==='text'&&x.value==='HÓA ĐƠN BÁN HÀNG');
  assert.equal(t?.color,p.headerText);
});

test('selection is explicit, persists by device, previews do not change saved choice',()=>{
  const h=harness();
  assert.equal(h.api.selected(),'print');
  assert.equal(h.api.paletteFor({templateId:'sage'}).id,'sage');
  assert.equal(h.api.selected(),'print');
  assert.equal(h.api.save('navy'),true);
  assert.equal(h.api.selected(),'navy');
  assert.equal(h.map.get('TAPHOA_INVOICE_TEMPLATE_V1'),'navy');
  assert.equal(h.api.save('invalid'),false);
  assert.equal(h.api.selected(),'navy');
  assert.equal(h.api.save('print'),true);
  assert.equal(h.api.selected(),'print');
});

test('unavailable storage safely keeps Print Master without silent financial changes',()=>{
  const h=harness({blockedStorage:true});
  assert.equal(h.api.selected(),'print');
  assert.equal(h.api.save('navy'),false);
  assert.equal(h.api.selected(),'print');
  assert.match(registrySource,/Không lưu được trên thiết bị này/);
  for(const source of [registrySource,renderSource]){
    assert.doesNotMatch(source,/\bfetch\s*\(|\bpostMessage\s*\(|taphoa_debt_ledger/);
  }
});

test('selection UI and asset entry are mounted only once in existing Settings, responsive to small phones',()=>{
  assert.match(registrySource,/#tab-cai-dat \.settings-list/);
  assert.match(registrySource,/document\.getElementById\('invoiceTemplatesManage'\)/);
  assert.match(registrySource,/getElementById\('invoiceTemplatePreviewImage'\)/);
  assert.match(registrySource,/getElementById\('invoiceTemplateSave'\)/);
  assert.match(registrySource,/renderCanvas\(Object\.assign\(\{\},demo,\{templateId:staged\}\),1\)/);
  assert.match(registrySource,/aria-modal="true"/);
  assert.match(style,/@media\(max-width:370px\)/);
  assert.match(index,/fixed-ui-invoice-templates\.css\?v=order-ui-385/);
  assert.match(index,/fixed-ui-invoice-templates\.js\?v=order-ui-385/);
  assert.ok(index.indexOf('fixed-ui-invoice-templates.js')>index.indexOf('fixed-ui-portrait-order.js'));
  assert.match(index,/template-catalog=20261117-385/);
});
