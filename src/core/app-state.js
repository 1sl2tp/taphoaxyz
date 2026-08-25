const initial=()=>({user:null,permissions:{},products:[],sources:[],customers:[],orders:[],debtSummary:[],printSettings:{},revisions:{},editOrder:null});

export function createAppState(){
  let state=initial();
  return {
    get:()=>state,
    reset:()=>{state=initial();return state;},
    setBootstrap:data=>{state={...initial(),...data,permissions:data?.permissions||{},products:data?.products||[],sources:data?.sources||[],customers:data?.customers||[],orders:data?.orders||[],debtSummary:data?.debtSummary||[],printSettings:data?.printSettings||{},revisions:data?.revisions||{},editOrder:state.editOrder};return state;},
    mergeDomains:data=>{const next={...state};for(const key of ['products','sources','customers','orders','debtSummary','printSettings','selfCustomer'])if(Object.hasOwn(data||{},key))next[key]=data[key];if(data?.revisions)next.revisions={...state.revisions,...data.revisions};state=next;return state;},
    setEditOrder:order=>{state={...state,editOrder:order||null};},
    consumeEditOrder:()=>{const order=state.editOrder;state={...state,editOrder:null};return order;}
  };
}
