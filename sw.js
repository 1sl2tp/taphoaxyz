'use strict';

const CACHE_PREFIX='taphoa-runtime-';
const CACHE_NAME='taphoa-runtime-v37';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
});

async function putSuccessfulResponse(cache,request,response){
  if(response?.ok)void cache.put(request,response.clone()).catch(()=>{});
  return response;
}

async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request);
    return putSuccessfulResponse(cache,request,response);
  }catch(error){
    const cached=await cache.match(request);
    if(cached)return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request,event){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);
  const networkPromise=fetch(request)
    .then(response=>putSuccessfulResponse(cache,request,response));

  if(cached){
    event.waitUntil(networkPromise.then(()=>undefined).catch(()=>undefined));
    return cached;
  }
  return networkPromise;
}

// Use the last-good public shell immediately on returning PWA launches.
// Revalidate once in background; no business RPC or session state is cached here.
// Explicit version-updater navigation bypasses this shortcut to fetch the new build.
async function navigationCachedFirst(request,event){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request)||await cache.match('./');
  if(!cached)return networkFirst(new Request(request,{cache:'no-cache'}));
  event.waitUntil(networkFirst(new Request(request,{cache:'no-cache'})).catch(()=>null));
  return cached;
}

function isFastCachedAsset(request,url){
  if(url.searchParams.has('v'))return true;
  return request.destination==='image'||request.destination==='font';
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.endsWith('/version.json')||url.pathname.endsWith('version.json')){
    event.respondWith(fetch(new Request(request,{cache:'no-store'})));
    return;
  }

  if(request.mode==='navigate'||request.destination==='document'){
    // Explicit browser reload must use the current shell instead of old cached HTML.
    if(url.searchParams.has('__taphoa_build')||request.cache==='reload'||request.cache==='no-cache'){
      event.respondWith(networkFirst(new Request(request,{cache:'no-cache'})));
    }else{
      event.respondWith(navigationCachedFirst(request,event));
    }
    return;
  }

  if(isFastCachedAsset(request,url)){
    event.respondWith(staleWhileRevalidate(request,event));
    return;
  }

  event.respondWith(networkFirst(request));
});
