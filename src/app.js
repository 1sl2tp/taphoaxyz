import {CONFIG} from './core/config.js';
import {createAuthService} from './core/auth.js';
import {createApi} from './core/api.js';
import {createAppState,changedDomains} from './core/app-state.js';
import {createSnapshotStore} from './core/snapshot.js';
import {NAV_ITEMS,createRouter,normalizeRoute} from './core/router.js';
import {createSystemLayer} from './core/system.js';
import {icon} from './core/icons.js';

const $=id=>document.getElementById(id);
const auth=createAuthService();
const business=createApi({clientProvider:auth.getClient});
const appState=createAppState();
const snapshot=createSnapshotStore();
const system=createSystemLayer($('systemToast'));
let identity=null;
let router=null;
let activeCleanup=null;
let appOpenToken=0;
let syncTimer=null;
let syncInFlight=null;
let lifecycleBound=false;
let accountReturnFocus=null;
let tabSwipeCleanup=null;

function navMarkup(active){
  return NAV_ITEMS.map(item=>`<button type="button" data-nav="${item.id}" aria-current="${active===item.id?'page':'false'}"><span class="app-nav-icon">${icon(item.icon,{size:18})}</span><span class="app-nav-label">${item.label}</span></button>`).join('');
}

async function loadScreen(id){
  const modules={sales:()=>import('./screens/sales.js'),delivered:()=>import('./screens/delivered.js'),pending:()=>import('./screens/pending.js'),debt:()=>import('./screens/debt.js')};
  return modules[id]?.();
}

function currentUid(){return String(identity?.uid||'');}

function accountInitials(value=''){
  const words=String(value||'').trim().split(/\s+/).filter(Boolean);
  const text=words.length>1?`${words[0][0]||''}${words.at(-1)[0]||''}`:(words[0]||'TK').slice(0,2);
  return text.toUpperCase()||'TK';
}

function renderAccountIdentity(){
  const name=String(identity?.displayName||identity?.username||'Tài khoản').trim()||'Tài khoản';
  const username=String(identity?.username||'').trim().replace(/^@/,'');
  const initials=accountInitials(name);
  $('accountButtonInitials').textContent=initials;
  $('accountSheetAvatar').textContent=initials;
  $('accountName').textContent=name;
  $('accountHandle').textContent=username?`@${username}`:'';
}

function openAccountSheet(){
  if(!identity)return;
  renderAccountIdentity();
  accountReturnFocus=document.activeElement;
  $('accountSheet').hidden=false;
  $('appShell').dataset.accountSheetOpen='true';
  $('screenHost').setAttribute('inert','');
  $('appTopbar').setAttribute('inert','');
  requestAnimationFrame(()=>$('accountSheetClose')?.focus?.({preventScroll:true}));
}

function closeAccountSheet({restoreFocus=true}={}){
  const sheet=$('accountSheet');
  if(sheet)sheet.hidden=true;
  delete $('appShell').dataset.accountSheetOpen;
  $('screenHost').removeAttribute('inert');
  $('appTopbar').removeAttribute('inert');
  const target=accountReturnFocus;
  accountReturnFocus=null;
  if(restoreFocus&&target?.isConnected)requestAnimationFrame(()=>target.focus?.({preventScroll:true}));
}

function bindTabSwipe(){
  const host=$('screenHost');
  if(!host)return()=>{};
  let gesture=null;
  let suppressClickUntil=0;
  const rowSurface=target=>target?.closest?.('.sales-product-row,.delivered-order-card,.pending-order-card,.debt-customer-row');
  const ignoredTarget=target=>{
    if(target?.closest?.('input,textarea,select,[contenteditable="true"],.sales-groups,.sales-cart-overlay,.delivered-overlay,.pending-overlay,.debt-overlay,.account-sheet'))return true;
    const button=target?.closest?.('button');
    return Boolean(button&&!rowSurface(target));
  };
  const onPointerDown=event=>{
    if(event.pointerType==='mouse'||ignoredTarget(event.target))return;
    gesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
  };
  const finish=event=>{
    if(!gesture||event.pointerId!==gesture.pointerId){gesture=null;return;}
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;
    if(Math.abs(dx)<56||Math.abs(dx)<=Math.abs(dy)*1.25)return;
    const current=normalizeRoute(location.hash);const index=NAV_ITEMS.findIndex(item=>item.id===current);if(index<0)return;
    const nextIndex=dx<0?index+1:index-1;if(nextIndex<0||nextIndex>=NAV_ITEMS.length)return;
    suppressClickUntil=Date.now()+450;
    router?.navigate(NAV_ITEMS[nextIndex].id);
  };
  const cancel=()=>{gesture=null;};
  const suppressClick=event=>{
    if(Date.now()>suppressClickUntil||!rowSurface(event.target))return;
    suppressClickUntil=0;event.preventDefault();event.stopPropagation();
  };
  host.addEventListener('pointerdown',onPointerDown,{passive:true});
  host.addEventListener('pointerup',finish,{passive:true});
  host.addEventListener('pointercancel',cancel,{passive:true});
  host.addEventListener('click',suppressClick,true);
  return()=>{
    host.removeEventListener('pointerdown',onPointerDown);
    host.removeEventListener('pointerup',finish);
    host.removeEventListener('pointercancel',cancel);
    host.removeEventListener('click',suppressClick,true);
  };
}

async function refresh(domains=[]){
  const unique=[...new Set(domains.map(String))];if(!unique.length)return appState.get();
  const data=await business.domains(unique);
  appState.mergeDomains(data||{});
  const uid=currentUid();if(uid)snapshot.save(uid,appState.get());
  return appState.get();
}

async function syncOnce(){
  if(!currentUid()||navigator.onLine===false||document.hidden)return appState.get();
  if(syncInFlight)return syncInFlight;
  syncInFlight=(async()=>{
    const meta=await business.meta();
    const changed=changedDomains(appState.get().revisions,meta?.revisions||{});
    if(changed.length)await refresh(changed);
    else{
      appState.mergeDomains({version:meta?.version||appState.get().version,syncSeconds:Number(meta?.syncSeconds)||appState.get().syncSeconds,permissions:meta?.permissions||appState.get().permissions,revisions:meta?.revisions||appState.get().revisions});
      snapshot.save(currentUid(),appState.get());
    }
    return appState.get();
  })().finally(()=>{syncInFlight=null;});
  return syncInFlight;
}

function stopSync(){
  if(syncTimer){clearInterval(syncTimer);syncTimer=null;}
  syncInFlight=null;
}

function startSync(){
  stopSync();
  const seconds=Math.max(10,Number(appState.get().syncSeconds)||30);
  syncTimer=setInterval(()=>{syncOnce().catch(error=>console.warn('data sync',error));},seconds*1000);
}

function bindLifecycle(){
  if(lifecycleBound)return;lifecycleBound=true;
  window.addEventListener('online',()=>{syncOnce().catch(error=>console.warn('data sync',error));});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncOnce().catch(error=>console.warn('data sync',error));});
}

function screenContext(root){
  return {
    root,identity,auth,business,system,
    getData:()=>appState.get(),
    subscribeData:listener=>appState.subscribe(listener),
    refresh,
    navigate:id=>router?.navigate(id),
    editOrder:order=>appState.setEditOrder(order),
    consumeEditOrder:()=>appState.consumeEditOrder()
  };
}

async function mountRoute(route){
  const id=normalizeRoute(`#${route}`);
  $('appNav').innerHTML=navMarkup(id);
  activeCleanup?.();activeCleanup=null;
  $('screenHost').replaceChildren();
  try {
    const mod=await loadScreen(id);
    if(typeof mod?.mount==='function')activeCleanup=await mod.mount(screenContext($('screenHost')));
  } catch(error){
    console.error(error);system.toast('Không tải được màn hình');
  }
}

function showAppShell(){
  $('loginScreen').hidden=true;$('appShell').hidden=false;renderAccountIdentity();
  if(!router){router=createRouter({onRoute:mountRoute});router.start();}
  if(!tabSwipeCleanup)tabSwipeCleanup=bindTabSwipe();
}

async function openApp(sessionInfo){
  const token=++appOpenToken;identity=sessionInfo.identity;
  const uid=String(identity?.uid||sessionInfo?.session?.user?.id||'');
  const cached=snapshot.load(uid);
  if(cached?.data){appState.setBootstrap(cached.data);showAppShell();}
  if(navigator.onLine!==false){
    const bootstrap=await business.bootstrap();if(token!==appOpenToken)return;
    appState.setBootstrap(bootstrap||{});snapshot.save(uid,appState.get());showAppShell();
  }else if(!cached?.data){
    throw Object.assign(new Error('Chưa có dữ liệu đã lưu cho tài khoản này'),{code:'OFFLINE_NO_CACHE'});
  }
  if(token!==appOpenToken)return;
  bindLifecycle();startSync();
}

function openLogin(){
  closeAccountSheet({restoreFocus:false});
  appOpenToken++;stopSync();activeCleanup?.();activeCleanup=null;tabSwipeCleanup?.();tabSwipeCleanup=null;router?.destroy();router=null;identity=null;appState.reset();
  $('appShell').hidden=true;$('loginScreen').hidden=false;
}

$('appNav').addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)router?.navigate(button.dataset.nav);});
$('accountButton').addEventListener('click',openAccountSheet);
$('accountSheetBackdrop').addEventListener('click',()=>closeAccountSheet());
$('accountSheetClose').addEventListener('click',()=>closeAccountSheet());
$('accountLogout').addEventListener('click',async()=>{
  const button=$('accountLogout');button.disabled=true;button.textContent='Đang đăng xuất...';
  try{await auth.logout();closeAccountSheet({restoreFocus:false});openLogin();}
  catch(error){console.error(error);system.toast('Không đăng xuất được');}
  finally{button.disabled=false;button.textContent='Đăng xuất';}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('accountSheet').hidden)closeAccountSheet();});
$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();const username=$('loginUsername').value.trim(),password=$('loginPassword').value,error=$('loginError'),submit=$('loginSubmit');
  error.hidden=true;submit.disabled=true;submit.textContent='Đang đăng nhập...';
  if($('loginRemember').checked)localStorage.setItem(CONFIG.usernameStorageKey,username);else localStorage.removeItem(CONFIG.usernameStorageKey);
  try{const info=await auth.login(username,password);await openApp(info);}
  catch(e){error.textContent=e?.message||'Sai tài khoản hoặc mật khẩu';error.hidden=false;}
  finally{submit.disabled=false;submit.textContent='Đăng nhập →';}
});

const savedUsername=localStorage.getItem(CONFIG.usernameStorageKey)||'';
if(savedUsername){$('loginUsername').value=savedUsername;$('loginRemember').checked=true;}

auth.restore().then(async info=>{if(!info){openLogin();return;}try{await openApp(info);}catch(error){console.error(error);openLogin();}}).catch(openLogin);
