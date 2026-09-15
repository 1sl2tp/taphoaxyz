import {createAppUpdateController,hasUnsavedSalesDom} from './app-update.js';

const VERSION_URL='./version.json';
const BUILD_PARAM='__build';
const APPLIED_BUILD_KEY='taphoa.xyz.app.applied-build';
const CHECK_INTERVAL_MS=45000;
let registration=null;

const readStored=key=>{try{return String(localStorage.getItem(key)||'').trim();}catch{return '';}};
const writeStored=(key,value)=>{try{localStorage.setItem(key,String(value||''));}catch{}};
const buildFromUrl=()=>{try{return String(new URL(location.href).searchParams.get(BUILD_PARAM)||'').trim();}catch{return '';}};
const buildFromMeta=()=>String(document.querySelector('meta[name="app-build-id"]')?.content||'').trim();
const currentBuild=buildFromUrl()||readStored(APPLIED_BUILD_KEY)||buildFromMeta()||'bootstrap';
if(buildFromUrl())writeStored(APPLIED_BUILD_KEY,currentBuild);

function hasFocusedEdit(){
  const active=document.activeElement;
  if(!active||active===document.body)return false;
  if(active.matches?.('[contenteditable="true"],textarea,select'))return true;
  if(active.matches?.('input')){
    const type=String(active.type||'text').toLowerCase();
    if(type==='search'||active.matches?.('[data-sales-search]'))return false;
    if(['button','submit','reset','checkbox','radio','range'].includes(type))return false;
    return String(active.value||'').trim().length>0;
  }
  return false;
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
    if(document.visibilityState==='visible')void controller.check({reason:'visible'});
  });
  window.addEventListener('focus',()=>void controller.check({reason:'focus'}));
  window.addEventListener('online',()=>void controller.check({reason:'online'}));
  document.addEventListener('input',()=>controller.maybeReload(),true);
  document.addEventListener('focusout',()=>controller.maybeReload(),true);
  setInterval(()=>void controller.check({reason:'interval'}),CHECK_INTERVAL_MS);
}

async function boot(){
  bind();
  await registerServiceWorker();
  const changed=await controller.check({reason:'boot'});
  if(!changed&&currentBuild&&currentBuild!=='bootstrap')writeStored(APPLIED_BUILD_KEY,currentBuild);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});
else void boot();

window.TAPHOAAppUpdate=Object.freeze({
  check:controller.check,
  maybeReload:controller.maybeReload,
  safeToReload,
  snapshot:controller.snapshot,
});
