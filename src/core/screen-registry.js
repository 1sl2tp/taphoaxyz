export const SCREEN_REGISTRY=Object.freeze({
  sales:Object.freeze({id:'sales',icon:'🛒',label:'Bán hàng',load:()=>import('../screens/sales.js')}),
  delivered:Object.freeze({id:'delivered',icon:'📋',label:'Đã giao',load:()=>import('../screens/delivered.js')}),
  pending:Object.freeze({id:'pending',icon:'📝',label:'Đơn tạm',load:()=>import('../screens/pending.js')}),
  debt:Object.freeze({id:'debt',icon:'💰',label:'Công nợ',load:()=>import('../screens/debt.js')})
});

export const SCREEN_IDS=Object.freeze(Object.keys(SCREEN_REGISTRY));
export const NAV_ITEMS=Object.freeze(SCREEN_IDS.map(id=>Object.freeze({
  id,
  icon:SCREEN_REGISTRY[id].icon,
  label:SCREEN_REGISTRY[id].label
})));

export const loadRegisteredScreen=id=>SCREEN_REGISTRY[id]?.load?.();
