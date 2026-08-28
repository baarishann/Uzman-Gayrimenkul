const CACHE="ug-v3";

self.addEventListener("install",()=>{
 self.skipWaiting();
});

self.addEventListener("activate",e=>{
 e.waitUntil(
  caches.keys().then(x=>
   Promise.all(x.map(k=>caches.delete(k)))
  )
 );
 self.clients.claim();
});

self.addEventListener("fetch",e=>{
 e.respondWith(fetch(e.request));
});
