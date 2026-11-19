const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('public/gas-sync.js','utf8');
const AT='2026-11-19T19:20:00.000Z';
const TOKEN='a'.repeat(48);
function boot(){
 const storage=new Map(),creds=new Map(),events=new Map();
 let offline=false,posts=0;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 function store(){
   return {
     get(key){
       const r={};
       queueMicrotask(()=>{r.result=creds.get(key);r.onsuccess?.()});
       return r;
     },
     put(val,key){creds.set(key,val)},
     delete(key){creds.delete(key)}
   };
 }
 const db={objectStoreNames:{contains:()=>true},
   close(){},
   transaction(){
     const tx={objectStore:store};
     queueMicrotask(()=>{tx.oncomplete?.()});
     return tx;
   }
 };
 const indexedDB={open(){
   const r={result:db};
   queueMicrotask(()=>r.onsuccess?.());
   return r;
 }};
 const fetch=async(url,opts)=>{
   assert.match(url,/^https:\/\/moje-ogrzewanie-gaz-sync\.ks-stawarz\.workers\.dev\/v1\/gas$/);
   assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
   if(offline)throw Error('offline');
   if(opts.method==='GET'){
     const records=new Map();
     for(const e of events.values()){
       if(e.op==='upsert')records.set(e.record_id,{id:e.record_id,...e.reading});
       else records.delete(e.record_id);
     }
     return {ok:true,json:async()=>({schema_version:1,readings:[...records.values()]})};
   }
   assert.equal(opts.method,'POST');
   posts++;
   for(const e of JSON.parse(opts.body).events)events.set(e.id,e);
   return {ok:true,json:async()=>({ok:true})};
 };
 const ctx=vm.createContext({localStorage,indexedDB,fetch,crypto:webcrypto,
   navigator:{onLine:true},TextEncoder,Date,Set,Map,Uint8Array});
 vm.runInContext(source,ctx);
 return {gas:vm.runInContext('GasSync',ctx),localStorage,creds,events,
   offline:v=>{offline=v},get posts(){return posts}};
}
function state(){
 return {conditions:[{at:AT,gas:775.696,meter:'new',sky:'clouds',outdoor:7}],
 gasHistory:[{id:'g-example',at:AT,gas:776.5,meter:'new',source:'manual'}]};
}
test('gas sync client preserves existing local data, normalizes only gas fields',()=>{
 const b=boot(),original=state();
 const normalized=b.gas.normalize(original);
 assert.equal(normalized.length,2);
 assert.equal(normalized[0].source,'observation');
 assert.equal(normalized[1].id,'g-example');
 assert.equal('sky' in normalized[0],false);
 assert.equal('outdoor' in normalized[0],false);
 assert.equal('setti' in normalized[1],false);
 assert.equal(original.conditions[0].sky,'clouds');
});
test('write key records data once, appends correction, archives deletion',async()=>{
 const b=boot(),s=state();
 assert.equal(await b.gas.connect('write',TOKEN),0);
 assert.equal(b.gas.status().active,false);
 assert.equal(b.posts,0);
 await b.gas.activate();
 await b.gas.synchronize(s);
 assert.equal(b.gas.remoteReadings().length,2);
 assert.equal(b.events.size,2);
 assert.equal(b.posts,1);
 await b.gas.synchronize(s);
 assert.equal(b.posts,1);
 s.gasHistory[0].gas=777.5;
 await b.gas.synchronize(s);
 assert.equal(b.events.size,3);
 assert.equal(b.gas.remoteReadings().find(x=>x.id==='g-example').gas,777.5);
 s.gasHistory=[];
 await b.gas.synchronize(s);
 assert.equal(b.events.size,4);
 assert.equal(b.gas.remoteReadings().length,1);
 assert.equal(s.conditions[0].gas,775.696);
});
test('read-only TV cannot activate writing or generate POST',async()=>{
 const b=boot(),s=state();
 await b.gas.connect('read',TOKEN);
 assert.equal(b.gas.status().role,'read');
 await assert.rejects(b.gas.activate(),/klucz zapisu/);
 assert.equal(await b.gas.synchronize(s),false);
 assert.equal(b.posts,0);
 await b.gas.disconnect();
 assert.equal(b.gas.status().connected,false);
 assert.equal(b.localStorage.getItem('gas-sync-meta-v1'),JSON.stringify({version:1,active:false,acked:{}}));
});
test('network failure keeps unconfirmed rows pending for later retry',async()=>{
 const b=boot(),s=state();
 await b.gas.connect('write',TOKEN);
 await b.gas.activate();
 b.offline(true);
 await assert.rejects(b.gas.synchronize(s),/Nie ma połączenia/);
 assert.equal(b.events.size,0);
 assert.equal(b.gas.status().active,true);
 b.offline(false);
 await b.gas.synchronize(s);
 assert.equal(b.gas.remoteReadings().length,2);
 assert.equal(b.posts,1);
});
test('restoring backups pauses synchronization; never erases remote history automatically',async()=>{
 const b=boot(),s=state();
 await b.gas.connect('write',TOKEN);
 await b.gas.activate();
 await b.gas.synchronize(s);
 const before=b.gas.remoteReadings().length;
 b.gas.pause(true);
 assert.equal(b.gas.status().active,false);
 await b.gas.synchronize({conditions:[],gasHistory:[]});
 assert.equal(b.gas.remoteReadings().length,before);
 assert.equal(b.posts,1);
 assert.equal(b.localStorage.getItem('moje-ogrzewanie-gas-sync-meta-v1'),null);
});
