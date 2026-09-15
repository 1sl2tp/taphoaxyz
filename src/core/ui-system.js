export const DETAIL_UI_CONFIG=Object.freeze({
  pending:Object.freeze({
    title:'Đơn tạm',tone:'pending',panel:'.pending-detail-panel',header:'.pending-detail-panel>header',titleSelector:'.pending-detail-panel>header>strong',context:'.pending-detail-meta',head:'.pending-detail-head',lines:'.pending-detail-lines',line:'.pending-detail-lines>div',total:'.pending-detail-total',actions:'.pending-detail-panel>footer',status:'.pending-detail-panel>header>span',close:'[data-order-close]'
  }),
  delivered:Object.freeze({
    title:'Đã giao',tone:'success',panel:'.delivered-detail-panel',header:'.delivered-detail-panel>header',titleSelector:'.delivered-detail-panel>header>strong',context:'.delivered-detail-meta',head:'.delivered-detail-head',lines:'.delivered-detail-lines',line:'.delivered-detail-line',total:'.delivered-detail-total',actions:'.delivered-detail-panel>footer',status:'.delivered-detail-panel>header>span',close:'[data-detail-close]'
  }),
  debt:Object.freeze({
    title:'Công nợ',tone:'success',panel:'.debt-order-panel',header:'.debt-order-panel>header',titleSelector:'.debt-order-panel>header>strong',context:'.debt-order-meta',head:'.debt-order-head',lines:'.debt-order-lines',line:'.debt-order-lines>div',total:'.debt-order-total',actions:null,status:'.debt-order-panel>header>span',close:'[data-order-close]'
  })
});

const ROLE_SELECTORS=Object.freeze({
  '[data-screen-id="sales"] .sales-product-name':'name',
  '[data-screen-id="sales"] .sales-product-meta':'meta',
  '[data-screen-id="sales"] .sales-price-readonly':'money-key',
  '[data-screen-id="sales"] .sales-cart-table-head':'label',
  '[data-screen-id="sales"] .sales-cart-total b':'money-key',
  '[data-screen-id="delivered"] .delivered-summary h2':'panel-title',
  '[data-screen-id="delivered"] .delivered-summary-head':'label',
  '[data-screen-id="delivered"] .delivered-summary-total':'summary-total',
  '[data-screen-id="delivered"] .delivered-order-mid':'meta',
  '[data-screen-id="delivered"] .delivered-order-top>strong':'money-key',
  '[data-screen-id="pending"] .pending-summary h2':'panel-title',
  '[data-screen-id="pending"] .pending-source-head':'label',
  '[data-screen-id="pending"] .pending-source-total':'summary-total',
  '[data-screen-id="pending"] .pending-order-mid small':'meta',
  '[data-screen-id="pending"] .pending-order-top>strong':'money-key',
  '[data-screen-id="debt"] .debt-group-head':'label',
  '[data-screen-id="debt"] .debt-customer-copy b':'name',
  '[data-screen-id="debt"] .debt-customer-copy small':'meta',
  '[data-screen-id="debt"] .debt-customer-row>strong':'money-key',
  '[data-screen-id="debt"] .debt-total-row strong':'money-hero'
});

export function compactOrderId(value){
  const id=String(value??'').trim();
  if(id.length<=12)return id;
  return `#${id.slice(-4)}`;
}

function addClasses(node,...names){if(node)node.classList?.add(...names.filter(Boolean));}
function setRole(node,role){if(node&&!node.hasAttribute?.('data-ui-type'))node.setAttribute?.('data-ui-type',role);}

function replaceText(root,from,to){
  if(!root||!from||from===to||typeof document==='undefined'||typeof NodeFilter==='undefined')return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(node.nodeValue?.includes(from))node.nodeValue=node.nodeValue.split(from).join(to);}
}

function toneClass(tone){return tone==='pending'?'ui-status-pending':tone==='danger'?'ui-status-danger':'ui-status-success';}
function classifyAction(button){
  const action=button?.dataset?.orderAction||button?.dataset?.detailAction||'';
  if(action==='deliver')addClasses(button,'ui-button-primary');
  else if(action==='delete')addClasses(button,'ui-button-danger');
  else if(action==='edit')button?.style?.setProperty('color','var(--ui-primary)');
}

export function decorateDetailUi(root,screenId){
  const config=DETAIL_UI_CONFIG[screenId];if(!root||!config)return;
  const panel=root.querySelector?.(config.panel);if(!panel)return;
  const header=root.querySelector?.(config.header),titleNode=root.querySelector?.(config.titleSelector),context=root.querySelector?.(config.context),head=root.querySelector?.(config.head),lines=root.querySelector?.(config.lines),total=root.querySelector?.(config.total),status=root.querySelector?.(config.status);
  addClasses(panel,'order-detail-panel');panel.dataset.uiDetail=screenId;
  addClasses(header,'order-detail-header');
  if(titleNode){
    const fullId=titleNode.dataset.fullOrderId||String(titleNode.textContent||'').trim();
    if(fullId&&!titleNode.dataset.fullOrderId)titleNode.dataset.fullOrderId=fullId;
    if(fullId)titleNode.title=fullId;
    if(String(titleNode.textContent||'').trim()!==config.title)titleNode.textContent=config.title;
    addClasses(titleNode,'order-detail-title');setRole(titleNode,'panel-title');
    if(context&&fullId)replaceText(context,fullId,compactOrderId(fullId));
  }
  addClasses(context,'order-detail-context');setRole(context,'body');
  addClasses(head,'order-detail-head');setRole(head,'label');
  addClasses(lines,'order-detail-lines');
  for(const row of root.querySelectorAll?.(config.line)||[]){addClasses(row,'order-detail-line');setRole(row,'body');for(const money of row.querySelectorAll?.(':scope > strong')||[])setRole(money,'money-row');}
  addClasses(total,'order-detail-total');setRole(total,'summary-total');
  if(config.actions){const actions=root.querySelector?.(config.actions);addClasses(actions,'order-detail-actions');for(const button of actions?.querySelectorAll?.('button')||[]){addClasses(button,'ui-button');setRole(button,'action');classifyAction(button);}}
  if(status){addClasses(status,'ui-status',toneClass(config.tone));setRole(status,'label');}
  for(const close of panel.querySelectorAll?.(config.close)||[]){addClasses(close,'ui-icon-button');}
  panel.style.setProperty('--order-accent','var(--ui-primary)');
}

export function decorateUi(root){
  if(!root)return;
  for(const [selector,role] of Object.entries(ROLE_SELECTORS))for(const node of root.querySelectorAll?.(selector)||[])setRole(node,role);
  const screen=root.querySelector?.('[data-screen-id]')||root.closest?.('[data-screen-id]');
  const screenId=screen?.dataset?.screenId;
  if(screenId)decorateDetailUi(root,screenId);
}

export function installUiSystem(host){
  if(!host)return()=>{};
  let queued=false;
  const sync=()=>{queued=false;decorateUi(host);};
  const schedule=()=>{if(queued)return;queued=true;(globalThis.queueMicrotask||((fn)=>Promise.resolve().then(fn)))(sync);};
  const Observer=globalThis.MutationObserver;
  const observer=Observer?new Observer(schedule):null;
  observer?.observe(host,{childList:true,subtree:true});
  sync();
  return()=>observer?.disconnect();
}

if(typeof document!=='undefined'){
  const host=document.getElementById('screenHost');
  if(host)installUiSystem(host);
}
