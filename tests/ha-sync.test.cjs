const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const PASS='wlasne bardzo dlugie haslo do synchronizacji 2026';
function browser(){
 const context=vm.createContext({Date,Set,Map,Uint8Array,TextEncoder,TextDecoder,atob,crypto:webcrypto});
 vm.runInContext(fs.readFileSync('public/ha-sync.js','utf8'),context);
 return vm.runInContext('HaSync',context);
}
function payload(){
 return {format:'moje-ogrzewanie-ha-historia',version:1,generated_at:'2024-11-15T19:30:00.000Z',
  engo:[{at:'2024-11-15T17:00:00.000Z',status:'on'},{at:'2024-11-15T17:15:00.000Z',status:'off'}],
  temperatures:[{room:'bedroom',at:'2024-11-15T17:01:00.000Z',temp:21.5},
    {room:'salon',at:'2024-11-15T17:02:00.000Z',temp:21.8}]};
}
test('encrypted GitHub file is readable only with password, can refresh, and merges idempotently',async()=>{
 const {encrypt}=await import('../scripts/ha-history-export.mjs');
 const env=encrypt(payload(),PASS);
 assert.equal(env.format,'moje-ogrzewanie-ha-szyfrowane');
 assert.doesNotMatch(JSON.stringify(env),/bedroom|21.5|2024-11-15T17/);
 const b=browser(),fetcher=async()=>({ok:true,text:async()=>JSON.stringify(env)});
 assert.equal((await b.refresh(fetcher)).locked,true);
 const data=await b.unlock(PASS,fetcher);
 assert.equal(data.engo.length,2);assert.equal(data.temperatures.length,2);
 const a=b.merge(data,[],[]);
 assert.equal(a.addedEngo,2);assert.equal(a.addedTemps,2);
 assert.equal(a.engos[0].source,'ha-auto');
 const repeated=b.merge(await b.refresh(fetcher),a.engos,a.temps);
 assert.equal(repeated.addedEngo,0);assert.equal(repeated.addedTemps,0);
 assert.equal(repeated.skippedEngo,2);assert.equal(repeated.skippedTemps,2);
});
test('bad password or modified ciphertext cannot silently import',async()=>{
 const {encrypt}=await import('../scripts/ha-history-export.mjs');
 const env=encrypt(payload(),PASS);
 const b=browser();
 await assert.rejects(b.unlock('inne bardzo dlugie haslo do historii',async()=>({ok:true,text:async()=>JSON.stringify(env)})),/odszyfrować/);
 const bad={...env,data:Buffer.from('atakuje'+env.data,'utf8').toString('base64')};
 await assert.rejects(b.unlock(PASS,async()=>({ok:true,text:async()=>JSON.stringify(bad)})),/odszyfrować/);
});
test('auto history preserves manual CSV rows and refuses ENGO or temperature conflicts',()=>{
 const b=browser(),p=b.validate(payload());
 const manual=[{at:'2024-11-15T17:00:00.000Z',status:'on',id:'eng-1',source:'import'}];
 const oldTemps=[{at:'2024-11-15T17:01:00.000Z',room:'bedroom',temp:21.5}];
 const a=b.merge(p,manual,oldTemps);
 assert.equal(a.addedEngo,1);assert.equal(a.addedTemps,1);
 assert.equal(a.engos[0].id,'eng-1');
 assert.throws(()=>b.merge({...p,engo:[{at:'2024-11-15T17:00:30.000Z',status:'off'}]},manual,[]),/Konflikt ENGO/);
 assert.throws(()=>b.merge({...p,temperatures:[{room:'bedroom',at:'2024-11-15T17:01:00.000Z',temp:22.1}]},manual,oldTemps),/Konflikt temperatury/);
});
test('malformed or non-zone timestamps, foreign rooms and excessive inputs are rejected',()=>{
 const b=browser();
 const p=payload();
 assert.throws(()=>b.validate({...p,engo:[{at:'2024-11-15T17:00:00',status:'on'}]}),/strefy/);
 assert.throws(()=>b.validate({...p,temperatures:[{room:'outside',at:p.generated_at,temp:21}]}),/temperatura/);
 assert.throws(()=>b.validate({...p,temperatures:Array(25001).fill(p.temperatures[0])}),/zbyt obszerny/);
});
test('HA exporter normalizes only known entities, merges overlapping windows and rejects contradictory minutes',async()=>{
 const {normalizeHistory,combine,ENGO,ROOM_ENTITIES,encrypt,decrypt}=await import('../scripts/ha-history-export.mjs');
 const src=[[{entity_id:ENGO,last_changed:'2024-11-15T17:00:00Z',state:'on'},
  {entity_id:ENGO,last_changed:'2024-11-15T17:15:00Z',state:'off'},
  {entity_id:ENGO,last_changed:'2024-11-15T17:17:00Z',state:'unavailable'}],
 [{entity_id:ROOM_ENTITIES.bedroom,last_changed:'2024-11-15T17:01:00Z',state:'21.5'},
  {entity_id:'sensor.unknown',last_changed:'2024-11-15T17:02:00Z',state:'20'}]];
 const n=normalizeHistory(src);
 assert.equal(n.engo.length,2);assert.equal(n.temperatures.length,1);
 const a=combine({engo:[],temperatures:[]},n);
 const again=combine(a,n);assert.equal(again.engo.length,2);assert.equal(again.temperatures.length,1);
 const env=encrypt(again,PASS),restored=decrypt(env,PASS);
 assert.equal(restored.temperatures.length,1);
 assert.throws(()=>combine(again,{engo:[{at:'2024-11-15T17:00:40Z',status:'off'}],temperatures:[]}),/Kolizja/);
});

test('ENGO climate sample is normalized, encrypted and merged without losing prior history',async()=>{
 const {ENGO_CLIMATE,parseEngoClimate,combine,encrypt,decrypt}=await import('../scripts/ha-history-export.mjs');
 const observed='2024-11-15T19:40:00.000Z';
 const sample=parseEngoClimate({
  entity_id:ENGO_CLIMATE,
  attributes:{current_temperature:22,target_temperature:99,temperature:22},
  last_updated:'2024-11-15T19:39:00Z'
 },observed);
 assert.equal(sample.temp,22);assert.equal(sample.target,22);
 assert.equal(sample.at,observed);
 const previous={engo:[{at:'2024-11-15T17:00:00Z',status:'on'}],temperatures:[]};
 const combined=combine(previous,{engo:[],temperatures:[]},sample);
 assert.equal(combined.engo.length,1);assert.equal(combined.engo_readings.length,1);
 const repeat=combine(combined,{engo:[],temperatures:[]},sample);
 assert.equal(repeat.engo_readings.length,1);
 const env=encrypt(repeat,PASS),restored=decrypt(env,PASS);
 assert.equal(browser().validate(restored).engoReadings[0].temp,22);
 assert.doesNotMatch(JSON.stringify(env),/engo_readings|current_temperature/);
});
test('old encrypted archive remains compatible and ENGO measurements are validated',async()=>{
 const b=browser(),old=b.validate(payload());
 assert.equal(old.engoReadings.length,0);
 const good={...payload(),engo_readings:[{
  at:'2024-11-15T19:40:00.000Z',temp:21.9,target:22,
  source_updated_at:'2024-11-15T19:39:00.000Z'
 }]};
 assert.equal(b.validate(good).engoReadings[0].temp,21.9);
 assert.throws(()=>b.validate({...good,engo_readings:[{...good.engo_readings[0],temp:'21.9'}]}),
  /termostatu ENGO/);
 const {parseEngoClimate,ENGO_CLIMATE}=await import('../scripts/ha-history-export.mjs');
 assert.equal(parseEngoClimate({entity_id:ENGO_CLIMATE,attributes:{current_temperature:'22',temperature:22}}),null);
});
