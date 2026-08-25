export const SCROLL_OWNER_SELECTORS=Object.freeze({
  sales:['[data-ui-id="sales-product-list"]','[data-ui-id="sales-cart-list"]'],
  delivered:['.delivered-list','.delivered-detail-lines','.delivered-print-lines'],
  pending:['.pending-list','.pending-source-detail-lines','.pending-detail-lines','.pending-print-lines'],
  debt:['.debt-list','.debt-customer-options','.debt-ledger','.debt-order-lines']
});

const screenIdOf=screen=>screen?.dataset?.screenId||screen?.getAttribute?.('data-screen-id')||'';
export const scrollOwnerKey=(screenId,selector,index)=>`${screenId}::${selector}::${index}`;

export function restoreScrollOwners(screen,positions,config=SCROLL_OWNER_SELECTORS){
  const screenId=screenIdOf(screen);if(!screenId)return;
  for(const selector of config[screenId]||[]){
    const nodes=Array.from(screen.querySelectorAll?.(selector)||[]);
    nodes.forEach((node,index)=>{
      const key=scrollOwnerKey(screenId,selector,index);
      if(positions.has(key))node.scrollTop=Math.max(0,Number(positions.get(key))||0);
    });
  }
}

export function bindScrollOwners(screen,positions,bound=new WeakSet(),config=SCROLL_OWNER_SELECTORS){
  const screenId=screenIdOf(screen);if(!screenId)return;
  for(const selector of config[screenId]||[]){
    const nodes=Array.from(screen.querySelectorAll?.(selector)||[]);
    nodes.forEach((node,index)=>{
      if(bound.has(node))return;
      const key=scrollOwnerKey(screenId,selector,index);
      node.addEventListener?.('scroll',()=>positions.set(key,Math.max(0,Number(node.scrollTop)||0)),{passive:true});
      bound.add(node);
    });
  }
}

export function syncScrollOwners(host,positions,bound,config=SCROLL_OWNER_SELECTORS){
  const screen=host?.querySelector?.('[data-screen-id]');if(!screen)return;
  restoreScrollOwners(screen,positions,config);
  bindScrollOwners(screen,positions,bound,config);
}

export function installScrollOwnerRuntime(host,config=SCROLL_OWNER_SELECTORS){
  if(!host)return()=>{};
  const positions=new Map(),bound=new WeakSet();
  const sync=()=>syncScrollOwners(host,positions,bound,config);
  const Observer=globalThis.MutationObserver;
  const observer=Observer?new Observer(sync):null;
  observer?.observe(host,{childList:true,subtree:true});
  sync();
  return()=>observer?.disconnect();
}

if(typeof document!=='undefined'){
  const host=document.getElementById('screenHost');
  if(host)installScrollOwnerRuntime(host);
}
