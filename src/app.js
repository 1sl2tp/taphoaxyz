import {CONFIG} from './core/config.js';
import {createAuthService} from './core/auth.js';
import {createApi} from './core/api.js';
import {createAppState,changedDomains} from './core/app-state.js';
import {createSnapshotStore} from './core/snapshot.js';
import {createRouter,normalizeRoute} from './core/router.js';
import {SCREEN_IDS,NAV_ITEMS,loadRegisteredScreen} from './core/screen-registry.js';
import {createSystemLayer} from './core/system.js';

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

function navMarkup(active){
  return NAV_ITEMS.map(item=>`<button type="button" data-nav="${item.id}" aria-current="${active===item.id?'page':'false'}"><span class="app-nav-icon">${item.icon}</span><span class="app-nav-label">${item.label}</span></button>`).join('');
}

function currentUid(){return String(identity?.uid||'');}

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
  const id=normalizeRoute(`#${route}`,SCREEN_IDS);
  $('appNav').innerHTML=navMarkup(id);
  activeCleanup?.();activeCleanup=null;
  $('screenHost').replaceChildren();
  try {
    const mod=await loadRegisteredScreen(id);
    if(typeof mod?.mount==='function')activeCleanup=await mod.mount(screenContext($('screenHost')));
  } catch(error){
    console.error(error);system.toast('Không tải được màn hình');
  }
}

function showAppShell(){
  $('loginScreen').hidden=true;$('appShell').hidden=false;
  if(!router){router=createRouter({onRoute:mountRoute,screenIds:SCREEN_IDS});router.start();}
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
  appOpenToken++;stopSync();activeCleanup?.();activeCleanup=null;router?.destroy();router=null;identity=null;appState.reset();
  $('appShell').hidden=true;$('loginScreen').hidden=false;
}

$('appNav').addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)router?.navigate(button.dataset.nav);});
$('loginEye').addEventListener('click',()=>{const input=$('loginPassword');input.type=input.type==='password'?'text':'password';});
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
