'use strict';

const CACHE_PREFIX='taphoa-runtime-';
const CACHE_NAME='taphoa-runtime-v29';

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

async function networkFirst(request){
  const networkRequest=new Request(request,{cache:'no-store'});
  try{
    const response=await fetch(networkRequest);
    if(response?.ok){
      const cache=await caches.open(CACHE_NAME);
      void cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }catch(error){
    const cached=await caches.match(request);
    if(cached)return cached;
    throw error;
  }
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
  event.respondWith(networkFirst(request));
});
