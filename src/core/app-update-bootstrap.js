import {createAppUpdateController,focusedInputBlocksReload,hasUnsavedSalesDom,refreshStylesheetLinks} from './app-update.js';

const VERSION_URL='./version.json';
const BUILD_PARAM='__build';
const APPLIED_BUILD_KEY='taphoa.xyz.app.applied-build';
const CHECK_INTERVAL_MS=4000;
let registration=null;
let hotStyleBuild='';

const readStored=key=>{try{return String(localStorage.getItem(key)||'').trim();}catch{return '';}};
const writeStored=(key,value)=>{try{localStorage.setItem(key,String(value||''));}catch{}};
const buildFromUrl=()=>{try{return String(new URL(location.href).searchParams.get(BUILD_PARAM)||'').trim();}catch{return '';}};
const buildFromMeta=()=>String(document.querySelector('meta[name="app-build-id"]')?.content||'').trim();
const currentBuild=buildFromUrl()||readStored(APPLIED_BUILD_KEY)||buildFromMeta()||'bootstrap';
if(buildFromUrl())writeStored(APPLIED_BUILD_KEY,currentBuild);

function hasFocusedEdit(){
  const active=document.activeElement;
  if(!active||active===document.body)return false;
  return focusedInputBlocksReload(active);
}

function safeToReload(){
  if(document.visibilityState&&document.visibilityState!=='visible')return false;
  if(hasUnsavedSalesDom(document))return false;
  if(hasFocusedEdit())return false;
  return true;
}

async function fetchVersion(){
  const response=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error(`update marker ${response.status}`);
  return response.json();
}

function reload(build){
  const next=new URL(location.href);
  next.searchParams.set(BUILD_PARAM,String(build||''));
  location.replace(next.toString());
}

const controller=createAppUpdateController({
  currentBuild,
  fetchVersion,
  isSafeToReload:safeToReload,
  reload,
  storage:sessionStorage,
});

async function checkForUpdate({reason='interval'}={}){
  const changed=await controller.check({reason});
  const pendingBuild=String(controller.snapshot().pendingBuild||'').trim();
  if(pendingBuild&&pendingBuild!==hotStyleBuild){
    refreshStylesheetLinks(document,pendingBuild,{baseHref:location.href});
    hotStyleBuild=pendingBuild;
  }
  return changed;
}

async function activateWaitingWorker(){
  try{
    if(registration?.waiting){
      registration.waiting.postMessage({type:'SKIP_WAITING'});
      return true;
    }
  }catch{}
  return false;
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  if(location.protocol!=='https:'&&location.hostname!=='localhost')return null;
  try{
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    registration.addEventListener?.('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener?.('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)void activateWaitingWorker();
      });
    });
    navigator.serviceWorker.addEventListener?.('controllerchange',()=>controller.maybeReload());
    await registration.update().catch(()=>{});
    return registration;
  }catch{return null;}
}

function bind(){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkForUpdate({reason:'visible'});
  });
  window.addEventListener('focus',()=>void checkForUpdate({reason:'focus'}));
  window.addEventListener('online',()=>void checkForUpdate({reason:'online'}));
  document.addEventListener('input',()=>controller.maybeReload(),true);
  document.addEventListener('focusout',()=>controller.maybeReload(),true);
  setInterval(()=>{
    if(!document.visibilityState||document.visibilityState==='visible')void checkForUpdate({reason:'fast-ui'});
  },CHECK_INTERVAL_MS);
}

async function boot(){
  bind();
  await registerServiceWorker();
  const changed=await checkForUpdate({reason:'boot'});
  if(!changed&&currentBuild&&currentBuild!=='bootstrap')writeStored(APPLIED_BUILD_KEY,currentBuild);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});
else void boot();

window.TAPHOAAppUpdate=Object.freeze({
  check:checkForUpdate,
  refreshNow:()=>checkForUpdate({reason:'manual-fast-ui'}),
  maybeReload:controller.maybeReload,
  safeToReload,
  snapshot:controller.snapshot,
});
