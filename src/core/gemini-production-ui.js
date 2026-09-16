const one=(root,selector)=>root?.querySelector?.(selector)||null;
const all=(root,selector)=>[...(root?.querySelectorAll?.(selector)||[])];

function addClass(node,...names){
  if(node)node.classList.add(...names);
  return node;
}

function ensureBefore(parent,before,className,text){
  if(!parent||parent.querySelector(`.${className}`))return;
  const node=document.createElement('h3');
  node.className=className;
  node.textContent=text;
  parent.insertBefore(node,before||parent.firstChild);
}

function orderHeading(screen,host,title,count){
  if(!host||host.querySelector('.order-gemini-heading'))return;
  const heading=document.createElement('div');
  heading.className='order-gemini-heading';
  const copy=document.createElement('div');
  const strong=document.createElement('strong');
  const small=document.createElement('small');
  strong.textContent=title;
  small.textContent=`${count} đơn`;
  copy.append(strong,small);
  heading.append(copy);
  host.prepend(heading);
}

function decorateSales(screen){
  addClass(one(screen,'.sales-main-context'),'sales-gemini-head');
  addClass(one(screen,'.sales-product-list'),'sales-gemini-product-list');
  all(screen,'.sales-cart-panel').forEach(panel=>addClass(panel,'sales-gemini-cart-sheet'));
  const search=one(screen,'[data-sales-search]');
  if(search)search.placeholder='Tìm tên, mã sản phẩm...';
  const totalLabel=all(screen,'.sales-cart-summary small').find(node=>/Tổng tiền/i.test(node.textContent||''));
  if(totalLabel&&totalLabel.textContent!=='Tổng thanh toán')totalLabel.textContent='Tổng thanh toán';
}

function decorateDelivered(screen){
  const head=addClass(one(screen,'.delivered-filter'),'order-gemini-head');
  addClass(one(screen,'.delivered-summary'),'order-gemini-summary');
  const list=one(screen,'.delivered-list');
  orderHeading(screen,head,'Đơn hàng đã giao',all(list,'.delivered-order-card').length);
  if(list)ensureBefore(screen,list,'order-gemini-list-title','Danh sách chi tiết đơn đã giao');
}

function decoratePending(screen){
  addClass(one(screen,'.pending-summary'),'order-gemini-summary');
  const list=one(screen,'.pending-list');
  let head=one(screen,'.order-gemini-head');
  if(!head){
    head=document.createElement('header');
    head.className='order-gemini-head order-gemini-pending-head';
    screen.prepend(head);
  }
  orderHeading(screen,head,'Đơn đang lưu tạm',all(list,'.pending-order-card').length);
  if(list)ensureBefore(screen,list,'order-gemini-list-title','Danh sách đơn tạm');
}

function decorateDebt(screen){
  const hero=addClass(one(screen,'.debt-hero'),'debt-gemini-head');
  addClass(one(screen,'.debt-list'),'debt-gemini-filters');
  if(hero&&!hero.querySelector('.debt-gemini-title')){
    const title=document.createElement('div');
    title.className='debt-gemini-title';
    title.textContent='Tổng công nợ';
    hero.prepend(title);
  }
}

export function decorateGeminiProductionUi(root=document){
  const screen=root.matches?.('[data-screen-id]')?root:one(root,'[data-screen-id]');
  if(!screen)return;
  if(screen.dataset.screenId==='sales')decorateSales(screen);
  else if(screen.dataset.screenId==='delivered')decorateDelivered(screen);
  else if(screen.dataset.screenId==='pending')decoratePending(screen);
  else if(screen.dataset.screenId==='debt')decorateDebt(screen);
}

function start(){
  const host=document.getElementById('screenHost');
  if(!host)return;
  let queued=false;
  const run=()=>{queued=false;decorateGeminiProductionUi(host);};
  const schedule=()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(run);
  };
  run();
  const observer=new MutationObserver(schedule);
  observer.observe(host,{childList:true,subtree:true});
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
