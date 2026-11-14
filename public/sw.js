'use strict';
// The release packager replaces this marker with a hash of public assets.
const VERSION='development-1.2';
const PREFIX='moje-ogrzewanie:'+self.registration.scope+':';
const CACHE=PREFIX+VERSION;
const ASSETS=['./','./index.html','./app.js','./storage.js','./insights.js','./manifest.webmanifest','./icons/icon192.png','./icons/icon512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
// No skipWaiting: finish using the current release before activating the next.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  // A coherent offline shell; personal data are never stored in this cache.
  e.respondWith(caches.open(CACHE).then(async c=>{
    const cached=await c.match(e.request.mode==='navigate'?'./index.html':e.request);
    return cached||fetch(e.request);
  }));
});
