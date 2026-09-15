const DEFAULT_SCREEN_IDS=Object.freeze(['sales','delivered','pending','debt']);

export function normalizeRoute(value='',screenIds=DEFAULT_SCREEN_IDS,fallback='sales'){
  const approved=new Set(screenIds);
  const raw=String(value||'').replace(/^#\/?/,'').split('/')[0].trim();
  return approved.has(raw)?raw:fallback;
}

export function createRouter({onRoute,screenIds=DEFAULT_SCREEN_IDS,fallback='sales'}={}){
  const emit=()=>onRoute?.(normalizeRoute(location.hash,screenIds,fallback));
  const navigate=id=>{
    const next=normalizeRoute(`#${id}`,screenIds,fallback);
    if(location.hash!==`#${next}`)location.hash=next;
    else emit();
  };
  window.addEventListener('hashchange',emit);
  return {start:emit,navigate,destroy:()=>window.removeEventListener('hashchange',emit)};
}
