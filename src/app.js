import {CONFIG} from './core/config.js';
import {createAuthService} from './core/auth.js';
import {createApi} from './core/api.js';
import {createAppState} from './core/app-state.js';
import {NAV_ITEMS,createRouter,normalizeRoute} from './core/router.js';
import {createSystemLayer} from './core/system.js';

const $=id=>document.getElementById(id);
const auth=createAuthService();
const business=createApi({clientProvider:auth.getClient});
const appState=createAppState();
const system=createSystemLayer($('systemToast'));
let identity=null;
let router=null;
let activeCleanup=null;
let appOpenToken=0;

function navMarkup(active){
  return NAV_ITEMS.map(item=>`<button type="button" data-nav="${item.id}" aria-current="${active===item.id?'page':'false'}"><span class="app-nav-icon">${item.icon}</span><span class="app-nav-label">${item.label}</span></button>`).join('');
}

async function loadScreen(id){
  const modules={sales:()=>import('./screens/sales.js'),delivered:()=>import('./screens/delivered.js'),pending:()=>import('./screens/pending.js'),debt:()=>import('./screens/debt.js')};
  return modules[id]?.();
}

async function refresh(domains=[]){
  const unique=[...new Set(domains)];if(!unique.length)return appState.get();
  const data=await business.domains(unique);appState.mergeDomains(data||{});return appState.get();
}

function screenContext(root){
  return {
    root,identity,auth,business,system,
    getData:()=>appState.get(),
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

async function openApp(sessionInfo){
  const token=++appOpenToken;identity=sessionInfo.identity;
  const bootstrap=await business.bootstrap();if(token!==appOpenToken)return;
  appState.setBootstrap(bootstrap||{});
  $('loginScreen').hidden=true;$('appShell').hidden=false;
  router?.destroy();router=createRouter({onRoute:mountRoute});router.start();
}

function openLogin(){
  appOpenToken++;activeCleanup?.();activeCleanup=null;router?.destroy();router=null;identity=null;appState.reset();
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
