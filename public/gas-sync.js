'use strict';
// Private, read-only on TV and optional upload from iPhone; does not control heating.
// The GitHub write token must NEVER be present here. A device-specific token is
// remembered in IndexedDB (if supported) and sent only to our HTTPS Worker.
const GasSync=(()=>{
 const API='https://moje-ogrzewanie-gaz-sync.ks-stawarz.workers.dev/v1/gas';
 const DB='moje-ogrzewanie-gas-device-v1', STORE='credentials', SLOT='gas';
 const META='gas-sync-meta-v1'; // Deliberately avoids DataStore legacy-key migration pattern.
 const ID=/^[a-zA-Z0-9_.:-]{3,100}$/;
 let credential=null, remote=[], remoteAt=null, message='Nie połączono z prywatnym archiwum.';
 let busy=false;
 function error(s){throw Error(s)}
 function idForCondition(c,i){return 'c-'+Date.parse(c.at).toString(36)+'-'+i}
 function normalize(state) {
   const records=[];
   for(const [i,c] of (state.conditions||[]).entries()) {
     if(typeof c.gas==='number'&&Number.isFinite(c.gas)){
       const id=ID.test(c.id||'')?c.id:idForCondition(c,i);
       records.push({id,at:c.at,gas:c.gas,meter:c.meter||'new',source:'observation'});
     }
   }
   for(const h of state.gasHistory||[]){
     if(!ID.test(h.id||''))error('Nieprawidłowy identyfikator odczytu. Zachowaj kopię JSON.');
     records.push({id:h.id,at:h.at,gas:h.gas,meter:h.meter,source:h.source});
   }
   const ids=new Set();
   for(const r of records){
     if(ids.has(r.id))error('Powtórzony identyfikator odczytu gazu.');
     ids.add(r.id);
   }
   return records;
 }
 function meta(){
   const raw=localStorage.getItem(META);
   if(!raw)return {version:1,active:false,acked:{}};
   let o;
   try{o=JSON.parse(raw)}catch(_){error('Stan synchronizacji jest uszkodzony. Nie nadpisano go.')}
   if(!o||o.version!==1||typeof o.active!=='boolean'||!o.acked||
      typeof o.acked!=='object'||Array.isArray(o.acked))error('Nieobsługiwany stan synchronizacji.');
   return o;
 }
 function storeMeta(m){localStorage.setItem(META,JSON.stringify(m))}
 function openDb(){return new Promise((resolve,reject)=>{
   if(typeof indexedDB==='undefined')return reject(Error('Ta przeglądarka nie obsługuje trwałego przechowywania kluczy.'));
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
   req.onerror=()=>reject(Error('Nie udało się otworzyć bezpiecznej pamięci przeglądarki.'));
   req.onsuccess=()=>resolve(req.result);
 })}
 async function loadKey(){
   const db=await openDb();
   try{return await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(SLOT);
     req.onsuccess=()=>resolve(req.result||null);
     req.onerror=()=>reject(Error('Nie udało się odczytać klucza.'));
   })}finally{db.close()}
 }
 async function persistKey(c){
   const db=await openDb();
   try{await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,'readwrite');
     tx.objectStore(STORE).put(c,SLOT);
     tx.oncomplete=resolve;
     tx.onerror=()=>reject(Error('Nie udało się zapamiętać klucza.'));
     tx.onabort=()=>reject(Error('Nie udało się zapamiętać klucza.'));
   })}finally{db.close()}
 }
 async function eraseKey(){
   const db=await openDb();
   try{await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,'readwrite');
     tx.objectStore(STORE).delete(SLOT);
     tx.oncomplete=resolve;
     tx.onerror=()=>reject(Error('Nie udało się usunąć klucza.'));
   })}finally{db.close()}
 }
 async function request(method,token,body){
   if(typeof fetch!=='function'||navigator.onLine===false)error('Brak internetu. Dane lokalne pozostają zapisane.');
   let response;
   try{
     response=await fetch(API,{method,cache:'no-store',
       headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
       ...(body?{body:JSON.stringify(body)}:{})});
   }catch(_){error('Nie ma połączenia z prywatnym archiwum. Odczyty lokalne są zachowane.')}
   if(response.status===401)error('Klucz odrzucony. Sprawdź wpis w Hasłach Apple.');
   if(!response.ok)error('Synchronizacja nie powiodła się (HTTP '+response.status+'). Dane lokalne są zachowane.');
   return response.json();
 }
 function validateRemote(reply){
   if(!reply||reply.schema_version!==1||!Array.isArray(reply.readings)||
      reply.readings.length>15000)error('Nieoczekiwany format archiwum gazu.');
   const a=[],seen=new Set();
   for(const r of reply.readings){
     if(!ID.test(r.id||'')||seen.has(r.id)||typeof r.at!=='string'||
        !Number.isFinite(Date.parse(r.at))||
        !['new','old'].includes(r.meter)||
        typeof r.gas!=='number'||!Number.isFinite(r.gas)||r.gas<0||r.gas>100000000||
        !['manual','orlen','observation'].includes(r.source))error('Błędne dane archiwum gazomierza.');
     seen.add(r.id);a.push({id:r.id,at:r.at,gas:r.gas,meter:r.meter,source:r.source});
   }
   return a;
 }
 async function getWith(c){
   const list=validateRemote(await request('GET',c.token));
   remote=list;remoteAt=new Date().toISOString();
   message='Archiwum prywatne odczytane · '+list.length+' odczytów · '+new Date().toLocaleTimeString('pl-PL');
   return list;
 }
 async function connect(role,token){
   if(!['read','write'].includes(role)||typeof token!=='string'||!(/^[a-f0-9]{48}$/i.test(token)))
     error('Wklej 48-znakowy klucz KLUCZ z Hasła Apple, nie jego SHA256.');
   const c={role,token:token.trim()};
   await getWith(c); // Verify access BEFORE persisting credentials.
   await persistKey(c);
   credential=c;
   return remote.length;
 }
 async function restore(){
   const c=await loadKey();
   if(!c){message='Nie połączono z prywatnym archiwum.';return false}
   if(!['read','write'].includes(c.role)||!(/^[a-f0-9]{48}$/i.test(c.token)))error('Zapisany klucz ma nieprawidłowy format.');
   credential=c;
   message='Klucz zapamiętany na tym urządzeniu. Dane zostaną pobrane po połączeniu.';
   return true;
 }
 async function disconnect(){
   await eraseKey();pause();credential=null;remote=[];remoteAt=null;
   message='Odłączono prywatne archiwum. Lokalnych wpisów nie zmieniono.';
 }
 async function refresh(){
   if(!credential)return [];
   try{return await getWith(credential)}
   catch(e){message=e.message;throw e}
 }
 async function digest(input){
   if(!crypto?.subtle)error('Synchronizacja wymaga bezpiecznego połączenia HTTPS.');
   const bytes=new TextEncoder().encode(input);
   const hash=await crypto.subtle.digest('SHA-256',bytes);
   return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 function pause(resetAck=false){const m=meta();m.active=false;if(resetAck)m.acked={};storeMeta(m)}
 async function activate(){
   if(credential?.role!=='write')error('Do wysyłania wymagany jest klucz zapisu iPhone.');
   const m=meta();m.active=true;storeMeta(m);
 }
 function fingerprint(r){return JSON.stringify({at:r.at,gas:r.gas,meter:r.meter,source:r.source})}
 async function synchronize(state){
   if(!credential||credential.role!=='write'||!meta().active)return false;
   if(busy)return false;
   busy=true;
   try{
     const current=normalize(state),present=new Map(current.map(r=>[r.id,r]));
     let m=meta();
     const updates=[];
     for(const r of current){
       const fp=fingerprint(r);
       if(m.acked[r.id]?.fingerprint===fp)continue;
       const event={record_id:r.id,op:'upsert',at:new Date(r.at).toISOString(),
         reading:{at:new Date(r.at).toISOString(),gas:r.gas,meter:r.meter,source:r.source}};
       event.id='u-'+(await digest(r.id+'|'+fp)).slice(0,56);
       updates.push({event,confirmed:{fingerprint:fp,at:r.at}});
     }
     for(const [id,previous] of Object.entries(m.acked)){
       if(present.has(id))continue;
       if(!previous.deletedAt){previous.deletedAt=new Date().toISOString();storeMeta(m)}
       const event={record_id:id,op:'delete',at:previous.deletedAt};
       event.id='d-'+(await digest(id+'|'+previous.fingerprint+'|'+previous.deletedAt)).slice(0,56);
       updates.push({event,confirmed:null});
     }
     let count=0;
     for(let i=0;i<updates.length;i+=100){
       const batch=updates.slice(i,i+100);
       const result=await request('POST',credential.token,{events:batch.map(x=>x.event)});
       if(result.ok!==true)error('Brak potwierdzenia zapisu z serwera.');
       for(const x of batch){
         if(x.confirmed)m.acked[x.event.record_id]=x.confirmed;
         else delete m.acked[x.event.record_id];
       }
       storeMeta(m);count+=batch.length;
     }
     await getWith(credential);
     message='Zsynchronizowano prywatnie · '+count+' zmian · '+remote.length+' odczytów w archiwum.';
     return true;
   }catch(e){message='Oczekuje na synchronizację: '+e.message;throw e}
   finally{busy=false}
 }
 function status(){
   let active=false;
   try{active=meta().active}catch(_){/* surfaced on explicit activation */}
   return {connected:!!credential,role:credential?.role||null,active,
     count:remote.length,remoteAt,busy,message};
 }
 return {normalize,connect,restore,disconnect,refresh,activate,synchronize,status,
   remoteReadings:()=>remote.slice(),isConnected:()=>!!credential,pause};
})();
