'use strict';
// Encrypted, read-only HA history. The app never sends HA/Tuya credentials and
// never publishes private plaintext. CryptoKey is non-exportable and device-local.
const HaSync=(()=>{
  const URL='https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/ha-historia.enc.json';
  const DB='moje-ogrzewanie-ha-key-v1',STORE='keys',KEY_ID='history';
  const ROOM_IDS=new Set(['bedroom','salon','kitchen','bigbath','smallbath','hall']);
  const atRe=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
  let liveKey=null;
  function fail(message){throw Error(message)}
  function bytes(base64){
    if(typeof base64!=='string'||!base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('Nieprawidłowy kod szyfrowania.');
    return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  }
  function openDb(){
    return new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined')return reject(Error('Brak magazynu klucza na urządzeniu.'));
      const req=indexedDB.open(DB,1);
      req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
      req.onerror=()=>reject(req.error||Error('Błąd zapisu klucza.'));
      req.onsuccess=()=>resolve(req.result);
    });
  }
  async function storedKey(){
    if(liveKey)return liveKey;
    try{
      const db=await openDb();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(KEY_ID);
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
        tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
      });
    }catch(_){return null}
  }
  async function remember(key){
    liveKey=key;
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(key,KEY_ID);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error);
      });
      db.close();
    }catch(_){/* Private browsing may not persist CryptoKey; memory remains. */}
  }
  async function forget(){
    liveKey=null;
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(KEY_ID);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error);
      });
      db.close();
    }catch(_){/* No stored key to forget. */}
  }
  function envelope(obj){
    if(!obj||obj.format!=='moje-ogrzewanie-ha-szyfrowane'||obj.version!==1||
       obj.kdf!=='PBKDF2-SHA256'||obj.cipher!=='AES-256-GCM'||
       obj.rounds!==310000)fail('Nieobsługiwany format zaszyfrowanego archiwum.');
    const salt=bytes(obj.salt),iv=bytes(obj.iv),data=bytes(obj.data);
    if(salt.length!==16||iv.length!==12||data.length<17||data.length>22*1024*1024)
      fail('Nieprawidłowy rozmiar archiwum.');
    return {salt,iv,data};
  }
  async function readEnvelope(fetcher){
    if(typeof fetcher!=='function')fail('Brak połączenia sieciowego.');
    const response=await fetcher(URL+'?t='+Date.now(),{cache:'no-store'});
    if(!response||!response.ok)fail('Brak zaszyfrowanej historii HA. Eksporter nie został jeszcze uruchomiony.');
    const text=await response.text();
    if(text.length>30*1024*1024)fail('Archiwum jest za duże.');
    return JSON.parse(text);
  }
  async function decrypt(obj,key){
    const {iv,data}=envelope(obj);
    let plaintext;
    try{plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data)}
    catch(_){fail('Nie można odszyfrować historii. Sprawdź hasło lub zgodność klucza.')}
    const payload=JSON.parse(new TextDecoder().decode(plaintext));
    return validate(payload);
  }
  async function derive(pass,salt){
    if(typeof pass!=='string'||pass.length<16)fail('Hasło do historii powinno mieć co najmniej 16 znaków.');
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,
      {name:'AES-GCM',length:256},false,['decrypt']);
  }
  async function unlock(pass,fetcher){
    const obj=await readEnvelope(fetcher);
    const {salt}=envelope(obj);
    const key=await derive(pass,salt);
    const payload=await decrypt(obj,key);
    await remember(key);
    return payload;
  }
  async function refresh(fetcher){
    const key=await storedKey();
    if(!key)return {locked:true};
    return decrypt(await readEnvelope(fetcher),key);
  }
  function timestamp(at){
    if(typeof at!=='string'||!atRe.test(at))fail('Archiwum zawiera czas bez strefy.');
    const ms=Date.parse(at);
    if(!Number.isFinite(ms)||ms>Date.now()+86400000)fail('Archiwum zawiera nieprawidłowy czas.');
    return new Date(ms).toISOString();
  }
  function validate(data){
    if(!data||data.format!=='moje-ogrzewanie-ha-historia'||data.version!==1||
       !Array.isArray(data.engo)||!Array.isArray(data.temperatures)||
       data.engo.length>40000||data.temperatures.length>25000)
      fail('Nieprawidłowy lub zbyt obszerny plik danych HA.');
    const engos=data.engo.map(x=>{
      if(!x||!['on','off'].includes(x.status))fail('Nieprawidłowy stan ENGO.');
      return {at:timestamp(x.at),status:x.status};
    });
    const temperatures=data.temperatures.map(x=>{
      if(!x||!ROOM_IDS.has(x.room)||typeof x.temp!=='number'||!Number.isFinite(x.temp)||
         x.temp< -10||x.temp>45)fail('Nieprawidłowa temperatura HA.');
      return {at:timestamp(x.at),room:x.room,temp:x.temp};
    });
    return {engo:engos,temperatures,generatedAt:timestamp(data.generated_at)};
  }
  function merge(data,oldEngo=[],oldTemps=[]){
    const engos=[...oldEngo],temps=[...oldTemps];
    const knownEngo=new Map();
    for(const e of engos)knownEngo.set(Math.floor(Date.parse(e.at)/60000),e.status);
    let addedEngo=0,skippedEngo=0;
    for(const e of data.engo){
      const ms=Date.parse(e.at),minute=Math.floor(ms/60000);
      if(knownEngo.has(minute)){
        if(knownEngo.get(minute)!==e.status)fail('Konflikt ENGO w tej samej minucie. Dane lokalne pozostawiono bez zmian.');
        skippedEngo++;continue;
      }
      engos.push({id:'engo-ha-'+ms+'-'+e.status,at:e.at,status:e.status,source:'ha-auto'});
      knownEngo.set(minute,e.status);addedEngo++;
    }
    const knownTemps=new Map(oldTemps.map(t=>[t.room+'|'+Date.parse(t.at),t.temp]));
    let addedTemps=0,skippedTemps=0;
    for(const t of data.temperatures){
      const key=t.room+'|'+Date.parse(t.at);
      if(knownTemps.has(key)){
        if(knownTemps.get(key)!==t.temp)fail('Konflikt temperatury z historią lokalną. Nie zapisano zmian.');
        skippedTemps++;continue;
      }
      temps.push(t);knownTemps.set(key,t.temp);addedTemps++;
      if(temps.length>25000)fail('Przekroczono limit historii 25 000 wpisów. Pobierz kopię JSON; nie usuwamy danych automatycznie.');
    }
    engos.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    temps.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.room.localeCompare(b.room));
    return {engos,temps,addedEngo,addedTemps,skippedEngo,skippedTemps};
  }
  return {validate,merge,envelope,unlock,refresh,forget};
})();