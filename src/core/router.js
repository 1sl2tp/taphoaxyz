export const NAV_ITEMS = Object.freeze([
  Object.freeze({id:'sales',icon:'🛒',label:'Bán hàng'}),
  Object.freeze({id:'delivered',icon:'📋',label:'Đã giao'}),
  Object.freeze({id:'pending',icon:'📝',label:'Đơn tạm'}),
  Object.freeze({id:'debt',icon:'💰',label:'Công nợ'})
]);

const APPROVED = new Set(NAV_ITEMS.map(x => x.id));

export function normalizeRoute(value='') {
  const raw=String(value||'').replace(/^#\/?/,'').split('/')[0].trim();
  return APPROVED.has(raw) ? raw : 'sales';
}

export function createRouter({onRoute}={}) {
  const emit=()=>onRoute?.(normalizeRoute(location.hash));
  const navigate=id=>{
    const next=normalizeRoute(`#${id}`);
    if (location.hash !== `#${next}`) location.hash=next;
    else emit();
  };
  window.addEventListener('hashchange',emit);
  return {start:emit,navigate,destroy:()=>window.removeEventListener('hashchange',emit)};
}
