import {icon} from './icons.js';

const NAV_ICONS=Object.freeze({sales:'cart',delivered:'check',pending:'clock',debt:'user'});

export function compactOrderId(value){const id=String(value??'').trim();return id.length<=12?id:`#${id.slice(-4)}`;}
function cleanActionText(value=''){return String(value).replace(/[🛒🖼️✅⏳📝🗑️📦⚠️💚⚡💵📌✕×◉‹›]/gu,'').trim();}
export function cleanStatusText(node){if(!node)return;const current=String(node.textContent||''),text=cleanActionText(current);if(text&&text!==current)node.textContent=text;}

export function setButtonIcon(button,name,{text=null,size=20}={}){
  if(!button)return;
  const visible=text===null?null:String(text),signature=`${name}:${size}:${visible??''}`;
  if(button.dataset.uiIconSignature===signature&&button.querySelector?.(`.ui-icon-${name}`))return;
  const fallback=cleanActionText(button.getAttribute?.('aria-label')||button.textContent||name)||name;
  if(!button.getAttribute?.('aria-label'))button.setAttribute?.('aria-label',visible||fallback);
  button.innerHTML=`${icon(name,{size})}${visible!==null?`<span>${visible}</span>`:''}`;
  button.dataset.uiIcon=name;button.dataset.uiIconSignature=signature;
}

function hydrateButton(root,selector,name,{text,size=18}={}){
  for(const button of root.querySelectorAll?.(selector)||[]){
    const visible=typeof text==='function'?text(button):text;
    setButtonIcon(button,name,{text:visible,size});
  }
}

function hydrateSearch(root){
  for(const row of root.querySelectorAll?.('.sales-search-row,.delivered-search')||[]){
    if(row.querySelector('.ui-search-leading-icon'))continue;
    const leading=document.createElement('span');leading.className='ui-search-leading-icon';leading.setAttribute('aria-hidden','true');leading.innerHTML=icon('search',{size:18});row.prepend(leading);
  }
}

export function decorateShellUi(root){
  if(!root)return;
  const eye=root.querySelector?.('#loginEye'),password=root.querySelector?.('#loginPassword');
  if(eye){setButtonIcon(eye,password?.type==='text'?'eye-off':'eye',{size:20});if(!eye.dataset.uiEyeBound){eye.dataset.uiEyeBound='1';eye.addEventListener?.('click',()=>queueMicrotask(()=>setButtonIcon(eye,password?.type==='text'?'eye-off':'eye',{size:20})));}}
  const close=root.querySelector?.('#accountSheetClose');if(close)setButtonIcon(close,'close',{size:18});
  const logout=root.querySelector?.('#accountLogout');if(logout&&!logout.disabled)setButtonIcon(logout,'logout',{text:'Đăng xuất',size:18});
  for(const button of root.querySelectorAll?.('#appNav [data-nav]')||[]){const iconName=NAV_ICONS[button.dataset.nav],holder=button.querySelector('.app-nav-icon');if(iconName&&holder&&holder.dataset.uiIcon!==iconName){holder.innerHTML=icon(iconName,{size:20});holder.dataset.uiIcon=iconName;}}
}

export function decorateUi(root){
  if(!root)return;
  decorateShellUi(root);hydrateSearch(root);
  hydrateButton(root,'[data-search-clear],[data-delivered-clear],.ui-icon-button[data-cart-close],.ui-icon-button[data-detail-close],.ui-icon-button[data-order-close],.ui-icon-button[data-print-close],.ui-icon-button[data-source-close],.ui-icon-button[data-debt-close]','close',{size:18});
  hydrateButton(root,'[data-receipt-share],[data-debt-share],[data-order-share]','share',{text:button=>cleanActionText(button.textContent)||'Chia sẻ ảnh',size:18});
  hydrateButton(root,'[data-print-now],[data-source-action="print"],[data-detail-action="print"],[data-order-action="print"]','print',{text:button=>cleanActionText(button.textContent)||'In',size:18});
  hydrateButton(root,'[data-delete-all],[data-detail-action="delete"],[data-order-action="delete"],[data-sales-action="clear"]','trash',{text:button=>cleanActionText(button.textContent)||'Xoá',size:18});
  hydrateButton(root,'[data-detail-action="edit"],[data-order-action="edit"]','edit',{text:'Sửa',size:18});
  hydrateButton(root,'[data-order-action="deliver"]','check',{text:'Duyệt',size:18});
  hydrateButton(root,'[data-quick-action="collect"],[data-detail-action="collect"]','check',{text:'Thu tiền',size:18});
  hydrateButton(root,'[data-quick-action="debt"],[data-detail-action="debt"]','plus',{text:'Ghi nợ',size:18});
  hydrateButton(root,'[data-calendar-toggle]','calendar',{text:button=>cleanActionText(button.textContent)||'Chọn ngày',size:18});
  hydrateButton(root,'[data-month="-1"]','chevron-left',{size:18});
  hydrateButton(root,'[data-month="1"]','chevron-right',{size:18});
  hydrateButton(root,'[data-qty-action="dec"],[data-cart-dec]','minus',{size:17});
  hydrateButton(root,'[data-qty-action="add"],[data-cart-add]','plus',{size:17});
  hydrateButton(root,'[data-cart-open]','cart',{text:button=>cleanActionText(button.textContent)||'Giỏ trống',size:18});
  hydrateButton(root,'[data-sort-dir]','chevron-right',{size:17});
}

export function installUiSystem(root=typeof document!=='undefined'?document:null){
  if(!root)return()=>{};
  let queued=false;const sync=()=>{queued=false;decorateUi(root);},schedule=()=>{if(queued)return;queued=true;(globalThis.queueMicrotask||((fn)=>Promise.resolve().then(fn)))(sync);};
  const Observer=globalThis.MutationObserver,observer=Observer?new Observer(schedule):null;
  observer?.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-current','type','disabled']});
  sync();return()=>observer?.disconnect();
}

if(typeof document!=='undefined')installUiSystem(document);