const initial=()=>({
  user:null,permissions:{},products:[],sources:[],customers:[],orders:[],debtSummary:[],signals:[],
  printSettings:{},selfCustomer:null,revisions:{},version:'',syncSeconds:30,editOrder:null
});

const REVISION_DOMAINS=['products','customers','orders','debt','settings'];

export function changedDomains(localRevisions={},remoteRevisions={}){
  return REVISION_DOMAINS.filter(domain=>Number(remoteRevisions?.[domain]||0)!==Number(localRevisions?.[domain]||0));
}

function bundleDomains(data={}){
  const changed=[];
  if(Object.hasOwn(data,'products')||Object.hasOwn(data,'sources'))changed.push('products');
  if(Object.hasOwn(data,'customers')||Object.hasOwn(data,'selfCustomer'))changed.push('customers');
  if(Object.hasOwn(data,'orders'))changed.push('orders');
  if(Object.hasOwn(data,'debtSummary'))changed.push('debt');
  if(Object.hasOwn(data,'printSettings'))changed.push('settings');
  return changed;
}

export function createAppState(){
  let state=initial();
  const listeners=new Set();
  const emit=changed=>{
    const event={state,changed};
    for(const listener of listeners)listener(event);
  };
  return {
    get:()=>state,
    reset:()=>{state=initial();emit(['reset']);return state;},
    setBootstrap:data=>{
      const currentEditOrder=state.editOrder;
      state={
        ...initial(),...(data||{}),
        permissions:data?.permissions||{},products:data?.products||[],sources:data?.sources||[],customers:data?.customers||[],
        orders:data?.orders||[],debtSummary:data?.debtSummary||[],signals:data?.signals||[],printSettings:data?.printSettings||{},selfCustomer:data?.selfCustomer??null,
        revisions:data?.revisions||{},version:String(data?.version||''),syncSeconds:Number(data?.syncSeconds)||30,editOrder:currentEditOrder
      };
      emit(['bootstrap']);
      return state;
    },
    mergeDomains:data=>{
      const next={...state};
      for(const key of ['products','sources','customers','orders','debtSummary','signals','printSettings','selfCustomer','permissions','version','syncSeconds']){
        if(Object.hasOwn(data||{},key))next[key]=data[key];
      }
      if(data?.revisions)next.revisions={...state.revisions,...data.revisions};
      state=next;
      const changed=bundleDomains(data||{});
      if(changed.length)emit(changed);
      return state;
    },
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    setEditOrder:order=>{state={...state,editOrder:order||null};},
    consumeEditOrder:()=>{const order=state.editOrder;state={...state,editOrder:null};return order;}
  };
}
