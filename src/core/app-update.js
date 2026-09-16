const DEFAULT_DEFER_MS=2500;
const DEFAULT_RELOAD_GUARD_MS=20000;

export function hasUnsavedSalesDom(root=globalThis.document){
  if(!root)return false;
  const qtyInputs=Array.from(root.querySelectorAll?.('[data-qty-input]')||[]);
  if(qtyInputs.some(input=>(Number(String(input?.value||'').replace(/\D/g,''))||0)>0))return true;
  const noteInputs=Array.from(root.querySelectorAll?.('[data-note-id]')||[]);
  if(noteInputs.some(input=>String(input?.value||'').trim().length>0))return true;
  return Boolean(root.querySelector?.('[data-sales-action="update"]'));
}

export function focusedInputBlocksReload(active){
  if(!active)return false;
  if(active.matches?.('[contenteditable="true"],textarea,select'))return true;
  if(!active.matches?.('input'))return false;
  const type=String(active.type||'text').toLowerCase();
  return !['button','submit','reset','checkbox','radio','range','file','hidden','color'].includes(type);
}

export function refreshStylesheetLinks(root=globalThis.document,build='',{baseHref=globalThis.location?.href||'http://localhost/'}={}){
  const nextBuild=String(build||'').trim();
  if(!root||!nextBuild)return 0;
  let base;
  try{base=new URL(String(baseHref||'http://localhost/'));}catch{return 0;}
  let changed=0;
  for(const link of Array.from(root.querySelectorAll?.('link[rel="stylesheet"][href]')||[])){
    const raw=String(link.getAttribute?.('href')||'').trim();
    if(!raw)continue;
    try{
      const url=new URL(raw,base);
      if(url.origin!==base.origin)continue;
      if(url.searchParams.get('__build')===nextBuild)continue;
      url.searchParams.set('__build',nextBuild);
      link.setAttribute?.('href',url.toString());
      changed+=1;
    }catch{}
  }
  return changed;
}

export function createAppUpdateController({
  currentBuild='',
  fetchVersion=async()=>null,
  isSafeToReload=()=>true,
  reload=()=>{},
  schedule=(fn,ms)=>setTimeout(fn,ms),
  cancelSchedule=token=>clearTimeout(token),
  now=()=>Date.now(),
  storage=null,
  deferMs=DEFAULT_DEFER_MS,
  reloadGuardMs=DEFAULT_RELOAD_GUARD_MS,
}={}){
  const activeBuild=String(currentBuild||'').trim();
  let pendingBuild='';
  let pendingVersion='';
  let checkPromise=null;
  let deferred=false;
  let deferredToken=null;
  let destroyed=false;

  const guardKey=build=>`taphoa.xyz.app.reload.${String(build||'unknown')}`;
  const recentlyReloaded=build=>{
    try{
      const value=Number(storage?.getItem?.(guardKey(build))||0);
      return value>0&&now()-value<reloadGuardMs;
    }catch{return false;}
  };
  const rememberReload=build=>{
    try{storage?.setItem?.(guardKey(build),String(now()));}catch{}
  };
  const scheduleDeferred=()=>{
    if(destroyed||deferred)return;
    deferred=true;
    deferredToken=schedule(()=>{
      deferred=false;
      deferredToken=null;
      maybeReload();
    },deferMs);
  };
  const maybeReload=()=>{
    if(destroyed||!pendingBuild)return false;
    if(!isSafeToReload()){
      scheduleDeferred();
      return false;
    }
    if(recentlyReloaded(pendingBuild)){
      scheduleDeferred();
      return false;
    }
    rememberReload(pendingBuild);
    reload(pendingBuild);
    return true;
  };
  const check=async({reason='interval'}={})=>{
    if(destroyed)return false;
    if(checkPromise)return checkPromise;
    checkPromise=(async()=>{
      try{
        const remote=await fetchVersion({reason});
        const nextBuild=String(remote?.build_id||'').trim();
        if(!nextBuild||nextBuild===activeBuild)return false;
        pendingBuild=nextBuild;
        pendingVersion=String(remote?.version||'').trim();
        maybeReload();
        return true;
      }catch{
        return false;
      }finally{
        checkPromise=null;
      }
    })();
    return checkPromise;
  };
  const destroy=()=>{
    destroyed=true;
    if(deferredToken!==null){
      try{cancelSchedule(deferredToken);}catch{}
    }
    deferred=false;
    deferredToken=null;
  };
  const snapshot=()=>({currentBuild:activeBuild,pendingBuild,pendingVersion,deferred});
  return {check,maybeReload,destroy,snapshot};
}
