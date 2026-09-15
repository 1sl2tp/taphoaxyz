import {icon} from './icons.js';

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
  '[data-screen-id="pending"] .pending-order-customer':'name',
  '[data-screen-id="pending"] .pending-order-context-line':'meta',
  '[data-screen-id="pending"] .pending-order-mid small':'meta',
  '[data-screen-id="pending"] .pending-order-top>strong':'money-key',
  '[data-screen-id="debt"] .debt-group-head':'label',
  '[data-screen-id="debt"] .debt-customer-copy b':'name',
  '[data-screen-id="debt"] .debt-customer-copy small':'meta',
  '[data-screen-id="debt"] .debt-customer-row>strong':'money-key',
  '[data-screen-id="debt"] .debt-total-row strong':'money-hero'
});

const NAV_ICONS=Object.freeze({sales:'cart',delivered:'check',pending:'clock',debt:'user'});

export function compactOrderId(value){
  const id=String(value??'').trim();
  if(id.length<=12)return id;
  return `#${id.slice(-4)}`;
}

function addClasses(node,...names){if(node)node.classList?.add(...names.filter(Boolean));}
function setRole(node,role){if(node&&!node.hasAttribute?.('data-ui-type'))node.setAttribute?.('data-ui-type',role);}
function cleanActionText(value=''){return String(value).replace(/[🛒🖼️✅✕×◉‹›]/gu,'').trim();}

export function setButtonIcon(button,name,{text=null,size=20}={}){
  if(!button)return;
  const visible=text===null?null:String(text);
  const signature=`${name}:${size}:${visible??''}`;
  if(button.dataset.uiIconSignature===signature&&button.querySelector?.(`.ui-icon-${name}`))return;
  const fallback=cleanActionText(button.getAttribute?.('aria-label')||button.textContent||name)||name;
  if(!button.getAttribute?.('aria-label'))button.setAttribute?.('aria-label',visible||fallback);
  button.innerHTML=`${icon(name,{size})}${visible!==null?`<span>${visible}</span>`:''}`;
  button.dataset.uiIcon=name;
  button.dataset.uiIconSignature=signature;
}

function replaceText(root,from,to){
  if(!root||!from||from===to||typeof document==='undefined'||typeof NodeFilter==='undefined')return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(node.nodeValue?.includes(from))node.nodeValue=node.nodeValue.split(from).join(to);}
}

function toneClass(tone){return tone==='pending'?'ui-status-pending':tone==='danger'?'ui-status-danger':'ui-status-success';}
function classifyAction(button){
  const action=button?.dataset?.orderAction||button?.dataset?.detailAction||'';
  addClasses(button,'ui-button');
  if(action==='deliver'){addClasses(button,'ui-button-primary');setButtonIcon(button,'check',{text:'Duyệt',size:18});}
  else if(action==='delete'){addClasses(button,'ui-button-danger');setButtonIcon(button,'trash',{text:'Xoá',size:18});}
  else if(action==='edit'){addClasses(button,'ui-button-ghost');setButtonIcon(button,'edit',{text:'Sửa',size:18});}
  else if(action==='print'){addClasses(button,'ui-button-ghost');setButtonIcon(button,'print',{text:'In',size:18});}
}

function decorateSalesCleanup(root){
  if(typeof document==='undefined')return;
  for(const note of root.querySelectorAll?.('[data-screen-id="sales"] [data-note-id]')||[]){
    if(note.getAttribute('placeholder')==='...')note.setAttribute('placeholder','Ghi chú');
  }
  const quick=root.querySelector?.('[data-screen-id="sales"] .sales-cart-quick');
  if(quick&&!quick.dataset.uiCompact){
    const label=cleanActionText(quick.textContent)||'Trống';
    quick.replaceChildren();
    quick.insertAdjacentHTML('afterbegin',icon('cart',{size:18}));
    const copy=document.createElement('span');copy.textContent=label.replace(/^(\d+)\s+(.+)$/,(_,qty,total)=>`${qty} SP · ${total}`);quick.append(copy);
    quick.dataset.uiCompact='1';
  }
  for(const panel of root.querySelectorAll?.('[data-screen-id="sales"] .sales-cart-panel')||[]){
    const title=panel.querySelector('.sales-cart-head>strong');
    if(title&&!title.dataset.uiIcon){title.innerHTML=`${icon('cart',{size:18})}<span>Giỏ hàng</span>`;title.dataset.uiIcon='cart';}
    if(panel.dataset.uiCompact)continue;
    const chip=panel.querySelector('.sales-cart-head>span');
    const total=panel.querySelector('.sales-cart-total span:last-child b');
    if(chip&&total){
      const qty=String(chip.textContent||'').trim().replace(/\s*sp$/i,'');
      chip.textContent=`${qty} SP · ${String(total.textContent||'').trim()}`;
      panel.dataset.uiCompact='1';
    }
  }
}

function decoratePendingCards(root){
  if(typeof document==='undefined')return;
  for(const card of root.querySelectorAll?.('[data-screen-id="pending"] .pending-order-card')||[]){
    if(card.dataset.uiCard==='pending')continue;
    const top=card.querySelector('.pending-order-top'),mid=card.querySelector('.pending-order-mid');
    const customer=mid?.querySelector(':scope > span > b'),meta=mid?.querySelector(':scope > span > small'),profit=mid?.querySelector(':scope > strong');
    const status=top?.querySelector('em'),total=top?.querySelector(':scope > strong');
    if(!top||!mid||!customer||!meta||!status||!total)continue;
    const primary=document.createElement('span');primary.className='pending-order-primary';
    addClasses(customer,'pending-order-customer');primary.append(customer);
    const side=document.createElement('span');side.className='pending-order-side';side.append(status,total);
    top.replaceChildren(primary,side);
    const context=document.createElement('span');context.className='pending-order-context';
    const line=document.createElement('small');line.className='pending-order-context-line';
    line.textContent=[compactOrderId(card.dataset.orderOpen),String(meta.textContent||'').trim()].filter(Boolean).join(' · ');
    context.append(line);mid.replaceChildren(context);if(profit)mid.append(profit);
    card.dataset.uiCard='pending';
  }
}

function decorateActionIcons(root){
  for(const button of root.querySelectorAll?.('[data-search-clear],[data-delivered-clear]')||[]){addClasses(button,'ui-icon-button');setButtonIcon(button,'close',{size:18});}
  for(const button of root.querySelectorAll?.('[data-cart-close],[data-detail-close],[data-order-close],[data-print-close]')||[]){addClasses(button,'ui-icon-button');setButtonIcon(button,'close',{size:18});}
  for(const button of root.querySelectorAll?.('[data-receipt-share],[data-debt-share],[data-order-share]')||[]){addClasses(button,'ui-button','ui-button-ghost');setButtonIcon(button,'share',{text:'Chia sẻ ảnh',size:18});}
  for(const button of root.querySelectorAll?.('[data-print-now]')||[]){addClasses(button,'ui-button','ui-button-ghost');setButtonIcon(button,'print',{text:'In',size:18});}
  for(const button of root.querySelectorAll?.('[data-calendar-toggle]')||[]){
    const text=cleanActionText(button.textContent)||'Chọn ngày';addClasses(button,'ui-button','ui-button-ghost');setButtonIcon(button,'calendar',{text,size:18});
  }
  for(const button of root.querySelectorAll?.('[data-month="-1"]')||[]){addClasses(button,'ui-icon-button');setButtonIcon(button,'chevron-left',{size:18});}
  for(const button of root.querySelectorAll?.('[data-month="1"]')||[]){addClasses(button,'ui-icon-button');setButtonIcon(button,'chevron-right',{size:18});}
  for(const button of root.querySelectorAll?.('[data-qty-action="dec"],[data-cart-dec]')||[]){setButtonIcon(button,'minus',{size:17});}
  for(const button of root.querySelectorAll?.('[data-qty-action="add"],[data-cart-add]')||[]){setButtonIcon(button,'plus',{size:17});}
}

export function decorateShellUi(root){
  if(!root)return;
  const eye=root.querySelector?.('#loginEye');
  if(eye){addClasses(eye,'ui-icon-button');const input=root.querySelector?.('#loginPassword');setButtonIcon(eye,input?.type==='text'?'eye-off':'eye',{size:20});if(!eye.dataset.uiEyeBound){eye.dataset.uiEyeBound='1';eye.addEventListener?.('click',()=>queueMicrotask(()=>setButtonIcon(eye,input?.type==='text'?'eye-off':'eye',{size:20})));}}
  const close=root.querySelector?.('#accountSheetClose');if(close){addClasses(close,'ui-icon-button');setButtonIcon(close,'close',{size:18});}
  const logout=root.querySelector?.('#accountLogout');if(logout){addClasses(logout,'ui-button','ui-button-ghost');if(!logout.disabled)setButtonIcon(logout,'logout',{text:'Đăng xuất',size:18});}
  for(const button of root.querySelectorAll?.('#appNav [data-nav]')||[]){
    const iconName=NAV_ICONS[button.dataset.nav];const holder=button.querySelector('.app-nav-icon');if(iconName&&holder&&holder.dataset.uiIcon!==iconName){holder.innerHTML=icon(iconName,{size:19});holder.dataset.uiIcon=iconName;}
  }
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
  for(const close of panel.querySelectorAll?.(config.close)||[]){addClasses(close,'ui-icon-button');setButtonIcon(close,'close',{size:18});}
  panel.style.setProperty('--order-accent','var(--ui-primary)');
}

export function decorateUi(root){
  if(!root)return;
  decorateShellUi(root);
  decorateSalesCleanup(root);
  decoratePendingCards(root);
  decorateActionIcons(root);
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
  observer?.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-current','type','disabled']});
  sync();
  return()=>observer?.disconnect();
}

if(typeof document!=='undefined'){
  decorateShellUi(document);
  const host=document.getElementById('appShell')||document.getElementById('screenHost');
  if(host)installUiSystem(host);
}
