const q=(root,selector)=>Array.from(root?.querySelectorAll?.(selector)||[]);
const add=(node,...classes)=>node?.classList?.add(...classes.filter(Boolean));
const data=(node,key,value)=>{if(node?.dataset)node.dataset[key]=String(value)};

const SCREEN_SELECTORS={
  sales:'[data-screen-id="sales"]',
  delivered:'[data-screen-id="delivered"]',
  pending:'[data-screen-id="pending"]',
  debt:'[data-screen-id="debt"]'
};

const TOOLBARS=[
  '[data-screen-id="sales"] .sales-pinned-head',
  '[data-screen-id="delivered"] .delivered-filter',
  '[data-screen-id="pending"] .pending-summary>header',
  '[data-screen-id="debt"] .debt-quick'
];

const TABLES=[
  '[data-screen-id="sales"] .sales-product-list',
  '[data-screen-id="sales"] .sales-cart-body',
  '[data-screen-id="delivered"] .delivered-summary',
  '[data-screen-id="delivered"] .delivered-list',
  '[data-screen-id="pending"] .pending-summary',
  '[data-screen-id="pending"] .pending-list',
  '[data-screen-id="pending"] .pending-source-detail-lines',
  '[data-screen-id="debt"] .debt-list',
  '[data-screen-id="debt"] .debt-ledger',
  '[data-screen-id="debt"] .debt-order-lines'
];

const ROWS=[
  '[data-screen-id="sales"] .sales-product-row',
  '[data-screen-id="sales"] .sales-cart-line',
  '[data-screen-id="delivered"] .delivered-summary-grid:not(.delivered-summary-head)',
  '[data-screen-id="delivered"] .delivered-order-card',
  '[data-screen-id="pending"] .pending-source-row',
  '[data-screen-id="pending"] .pending-order-card',
  '[data-screen-id="pending"] .pending-source-detail-lines>div',
  '[data-screen-id="debt"] .debt-customer-row',
  '[data-screen-id="debt"] .debt-transaction-row',
  '[data-screen-id="debt"] .debt-order-lines>div'
];

/* Only true controls are actions. Clickable data rows remain rows visually. */
const ACTIONS=[
  '[data-cart-open]',
  '[data-cart-close]',
  '[data-sales-action]',
  '[data-search-clear]',
  '[data-delivered-clear]',
  '[data-today]',
  '[data-calendar-toggle]',
  '[data-month]',
  '[data-calendar-day]',
  '[data-quick]',
  '[data-calendar-close]',
  '[data-detail-action]',
  '[data-detail-close]',
  '[data-receipt-share]',
  '[data-print-close]',
  '[data-print-now]',
  '[data-delete-all]',
  '[data-source-action]',
  '[data-source-close]',
  '[data-order-action]',
  '[data-order-close]',
  '[data-sort-menu]',
  '[data-sort-dir]',
  '[data-sort]',
  '[data-quick-action]',
  '[data-debt-close]',
  '[data-debt-share]',
  '[data-order-share]',
  '#accountLogout',
  '#accountSheetClose'
];

const POPUP_L1=[
  '.sales-cart-panel',
  '.delivered-detail-panel',
  '.pending-detail-panel',
  '.pending-source-panel',
  '.debt-detail-panel',
  '.account-sheet-card'
];

const POPUP_L2=[
  '.delivered-print-panel',
  '.pending-print-panel',
  '.debt-order-panel'
];

function mark(node,role,layer=null){
  if(!node)return;
  data(node,'uiRole',role);
  if(layer!==null)data(node,'uiLayer',layer);
}

function decorateScreens(root){
  for(const [screen,selector] of Object.entries(SCREEN_SELECTORS)){
    for(const node of q(root,selector)){
      add(node,'ui-main');
      mark(node,'main-screen',1);
      data(node,'uiScreen',screen);
    }
  }
}

function decoratePopup(node,level){
  if(!node)return;
  add(node,level===1?'ui-popup-l1':'ui-popup-l2');
  mark(node,level===1?'popup-level-1':'popup-level-2',level+1);
  node.setAttribute?.('role','dialog');
  node.setAttribute?.('aria-modal','true');
  const header=node.querySelector?.(':scope > header');
  const footer=node.querySelector?.(':scope > footer');
  if(header){add(header,'ui-popup-header');mark(header,'popup-header',level+1)}
  if(footer){add(footer,'ui-popup-actions');mark(footer,'popup-actions',level+1)}
}

function decoratePopups(root){
  for(const selector of POPUP_L1)for(const node of q(root,selector))decoratePopup(node,1);
  for(const selector of POPUP_L2)for(const node of q(root,selector))decoratePopup(node,2);
}

function layerOf(node){
  if(node.closest?.('.ui-popup-l2'))return 3;
  if(node.closest?.('.ui-popup-l1'))return 2;
  return 1;
}

function decorateCollections(root){
  for(const selector of TOOLBARS)for(const node of q(root,selector)){add(node,'ui-toolbar');mark(node,'toolbar',1)}
  for(const selector of TABLES)for(const node of q(root,selector)){add(node,'ui-table');mark(node,'table',layerOf(node))}
  for(const selector of ROWS)for(const node of q(root,selector)){add(node,'ui-row');mark(node,'row',layerOf(node))}
  for(const selector of ACTIONS)for(const node of q(root,selector)){
    add(node,'ui-action');
    mark(node,'action',layerOf(node));
  }
}

function decorateActionSemantics(root){
  for(const button of q(root,'[data-sales-action="done"],[data-sales-action="update"],[data-order-action="deliver"]'))add(button,'ui-action-primary');
  for(const button of q(root,'[data-quick-action="collect"],[data-detail-action="collect"]'))add(button,'ui-action-success');
  for(const button of q(root,'[data-quick-action="debt"],[data-detail-action="debt"],[data-delete-all],[data-sales-action="clear"],[data-order-action="delete"],[data-detail-action="delete"]'))add(button,'ui-action-danger');
}

export function decorateSemanticUi(root=document){
  if(!root)return;
  decorateScreens(root);
  decoratePopups(root);
  decorateCollections(root);
  decorateActionSemantics(root);
}

export function installSemanticUi(root=document){
  if(!root)return()=>{};
  let queued=false;
  const sync=()=>{queued=false;decorateSemanticUi(root)};
  const schedule=()=>{if(queued)return;queued=true;(globalThis.queueMicrotask||((fn)=>Promise.resolve().then(fn)))(sync)};
  const Observer=globalThis.MutationObserver;
  const observer=Observer?new Observer(schedule):null;
  observer?.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-current','aria-hidden']});
  sync();
  return()=>observer?.disconnect();
}

if(typeof document!=='undefined')installSemanticUi(document.getElementById('appShell')||document);
