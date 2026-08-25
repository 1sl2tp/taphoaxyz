import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function block(css,selector){
  const start=css.indexOf(selector);
  assert.notEqual(start,-1,`Missing CSS selector: ${selector}`);
  const open=css.indexOf('{',start);
  const close=css.indexOf('}',open);
  return css.slice(open+1,close);
}

function mustContain(css,selector,...tokens){
  const body=block(css,selector);
  for(const token of tokens)assert.ok(body.includes(token),`${selector} must contain ${token}; got: ${body}`);
}

function mustNotContain(css,selector,...tokens){
  const body=block(css,selector);
  for(const token of tokens)assert.ok(!body.includes(token),`${selector} must not contain ${token}; got: ${body}`);
}

test('App Shell locks viewport scroll ownership to Active Screen regions',()=>{
  const css=read('src/styles/scroll-owner.css');
  mustContain(css,'.taphoa-viewport','height:100dvh','overflow:hidden');
  mustContain(css,'.app-shell','height:100%','min-height:0','overflow:hidden');
  mustContain(css,'.screen-host','height:100%','min-height:0','overflow:hidden');
});

test('four primary screens assign scroll to their data lists, not screen roots',()=>{
  const css=read('src/styles/scroll-owner.css');
  const cases=[
    ['[data-screen-id="sales"]','.sales-products'],
    ['[data-screen-id="delivered"]','.delivered-list'],
    ['[data-screen-id="pending"]','.pending-list'],
    ['[data-screen-id="debt"]','.debt-list']
  ];
  for(const [screen,list] of cases){
    mustContain(css,screen,'height:100%','min-height:0','overflow:hidden','display:grid');
    mustNotContain(css,screen,'overflow:auto');
    mustContain(css,`[data-screen-id="${screen.match(/"([^"]+)"/)[1]}"] ${list}`,'min-height:0','overflow:auto');
  }
});

test('detail panels keep chrome fixed and give long inner lists the scroll',()=>{
  const css=read('src/styles/scroll-owner.css');
  for(const panel of ['.delivered-detail-panel','.delivered-print-panel','.pending-source-panel','.pending-detail-panel','.pending-print-panel','.debt-detail-panel','.debt-order-panel']){
    mustContain(css,panel,'overflow:hidden','display:grid');
  }
  for(const list of ['.delivered-detail-lines','.delivered-print-lines','.pending-source-detail-lines','.pending-detail-lines','.pending-print-lines','.debt-ledger','.debt-order-lines']){
    mustContain(css,list,'min-height:0','overflow:auto');
  }
});

test('index activates scroll owner CSS after screen CSS and starts runtime',()=>{
  const html=read('index.html');
  const debtCss=html.indexOf('./src/styles/debt.css');
  const ownerCss=html.indexOf('./src/styles/scroll-owner.css');
  const runtime=html.indexOf('./src/core/scroll-owner.js');
  assert.ok(debtCss>=0,'debt.css must stay loaded');
  assert.ok(ownerCss>debtCss,'scroll-owner.css must load after screen styles so ownership overrides win');
  assert.ok(runtime>=0,'scroll-owner runtime must be loaded');
});

test('scroll owner runtime restores scrollTop after screen re-render',async()=>{
  let mod;
  try{mod=await import('../src/core/scroll-owner.js');}
  catch(error){assert.fail(`scroll-owner runtime missing: ${error.message}`);}
  const positions=new Map([
    ['sales::.sales-products::0',146],
    ['sales::.sales-cart-body::0',32]
  ]);
  const product={scrollTop:0},cart={scrollTop:0};
  const screen={dataset:{screenId:'sales'},querySelectorAll(selector){return selector==='.sales-products'?[product]:selector==='.sales-cart-body'?[cart]:[];}};
  mod.restoreScrollOwners(screen,positions);
  assert.equal(product.scrollTop,146);
  assert.equal(cart.scrollTop,32);
});

test('scroll owner runtime records each repeated list independently',async()=>{
  let mod;
  try{mod=await import('../src/core/scroll-owner.js');}
  catch(error){assert.fail(`scroll-owner runtime missing: ${error.message}`);}
  const positions=new Map();
  const listeners=[];
  const nodeA={scrollTop:11,addEventListener(type,fn){listeners.push([type,fn,this]);}};
  const nodeB={scrollTop:27,addEventListener(type,fn){listeners.push([type,fn,this]);}};
  const screen={dataset:{screenId:'sales'},querySelectorAll(selector){return selector==='.sales-cart-body'?[nodeA,nodeB]:[];}};
  mod.bindScrollOwners(screen,positions,new WeakSet(),{sales:['.sales-cart-body']});
  assert.equal(listeners.length,2);
  nodeA.scrollTop=91;listeners[0][1]();
  nodeB.scrollTop=53;listeners[1][1]();
  assert.equal(positions.get('sales::.sales-cart-body::0'),91);
  assert.equal(positions.get('sales::.sales-cart-body::1'),53);
});
