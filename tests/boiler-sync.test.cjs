const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('public/boiler-sync.js','utf8');
const key='a'.repeat(64);
const host='https://test.example.ts.net';

function boot(server, storage=new Map()){
 const ctx=vm.createContext({URL,AbortSignal,fetch:server,
   localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(source,ctx);
 return {sync:vm.runInContext('BoilerSync',ctx),storage};
}
function responder(){
 let row={value:null,revision:0,updated_at:null}, online=true;
 const requests=[];
 const fetch=async(url,options)=>{
   if(!online)throw Error('offline');
   requests.push([url,options]);
   if(options.method==='PUT'){
     const payload=JSON.parse(options.body);
     if(payload.revision!==row.revision)return {ok:false,status:409};
     row={value:payload.value,revision:row.revision+1,updated_at:'2026-11-21T12:00:00Z'};
   }
   return {ok:true,json:async()=>row};
 };
 return {fetch,requests,online:v=>online=v};
}
test('pair, confirm one private write and restore the same setting after restart',async()=>{
 const server=responder(), a=boot(server.fetch);
 assert.equal((await a.sync.connect(host,key)).value,null);
 assert.equal((await a.sync.write(55,0)).value,55);
 const b=boot(server.fetch,a.storage);
 assert.equal((await b.sync.refresh()).value,55);
 assert.equal(server.requests.filter(([,x])=>x.method==='PUT').length,1);
 assert.equal(server.requests[1][0],host+'/api/boiler_note/v1');
});
test('offline write is unconfirmed and never replays after reconnection',async()=>{
 const server=responder(),a=boot(server.fetch);
 await a.sync.connect(host,key);
 await a.sync.write(55,0);
 server.online(false);
 await assert.rejects(a.sync.write(60,1),/Brak połączenia/);
 assert.equal(a.sync.status().fresh,false);
 assert.equal(a.sync.status().record.value,55);
 server.online(true);
 assert.equal((await a.sync.refresh()).value,55);
 assert.equal(server.requests.filter(([,x])=>x.method==='PUT').length,1);
});
test('competing writes and stale editor do not overwrite confirmed data',async()=>{
 const server=responder(),a=boot(server.fetch),b=boot(server.fetch);
 await a.sync.connect(host,key);await b.sync.connect(host,key);
 await a.sync.write(55,0);
 await assert.rejects(b.sync.write(60,0),err=>err.conflict);
 await b.sync.refresh();
 await assert.rejects(b.sync.write(60,0),err=>err.conflict);
 assert.equal((await a.sync.refresh()).value,55);
});
test('address validation keeps credentials scoped to the expected private endpoint',()=>{
 const {sync}=boot(()=>{throw Error('Unexpected network request');});
 for(const url of [host+'/not-the-origin','http://test.example.ts.net','https://example.com',host+'/?bad=1'])
   assert.throws(()=>sync.connect(url,key));
});
