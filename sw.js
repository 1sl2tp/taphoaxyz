'use strict';

const CACHE_PREFIX='taphoa-runtime-';
const CACHE_NAME='taphoa-runtime-v36';

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
    event.respondWith(networkFirst(new Request(request,{cache:'no-cache'})));
    return;
  }

  if(isFastCachedAsset(request,url)){
    event.respondWith(staleWhileRevalidate(request,event));
    return;
  }

  event.respondWith(networkFirst(request));
});
