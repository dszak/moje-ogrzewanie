const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const PASS='wlasne bardzo dlugie haslo do synchronizacji 2026';
function browser(){
 const context=vm.createContext({Date,Set,Map,Uint8Array,TextEncoder,TextDecoder,atob,crypto:webcrypto});
 vm.runInContext(fs.readFileSync('public/dehumidifiers.js','utf8'),context);
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
 assert.deepEqual(Object.keys(env).sort(),['cipher','data','format','iv','kdf','rounds','salt','version']);
 assert.match(env.data,/^[a-zA-Z0-9+/]+={0,2}$/);
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

test('optional exporter emits source timestamps and suppresses restored or mismatched telemetry',async()=>{
 const {dashboardMapping,dashboardSnapshot}=await import('../scripts/ha-history-export.mjs');
 const mapping=dashboardMapping(JSON.stringify({
   demand:'binary_sensor.test',climate:'climate.test',power:'sensor.test_power'
 }));
 const last_updated='2026-11-23T12:00:00.000Z';
 const states={
   demand:{state:'on',last_updated,attributes:{event_ts_ms:Date.parse(last_updated)-3600000}},
   climate:{state:'heat',last_updated,attributes:{temperature:22,current_temperature:21.4}},
   power:{state:'152.3',last_updated,attributes:{unit_of_measurement:'W'}}
 };
 const snapshot=dashboardSnapshot(states,mapping);
 assert.equal(snapshot.engo.demandAt,'2026-11-23T11:00:00.000Z');
 assert.equal(snapshot.engo.measured,21.4);
 assert.equal(snapshot.bath.power.value,152.3);
 delete states.demand.attributes.event_ts_ms;
 states.power.attributes.unit_of_measurement='kWh';
 const incomplete=dashboardSnapshot(states,mapping);
 assert.equal(incomplete.engo.demand,null);
 assert.equal(incomplete.bath.power.value,null);
 assert.throws(()=>dashboardMapping('{"power":"switch.test"}'));
});

test('a restored old ENGO state cannot collide with a new source event',async()=>{
 const {normalizeHistory,combine,ENGO}=await import('../scripts/ha-history-export.mjs');
 const event=(recorded,state,source)=>({
   entity_id:ENGO,last_changed:recorded,state,attributes:{
     source:'approved',event_ts_ms:Date.parse(source)
   }
 });
 const a='2024-11-15T17:00:20.000Z',b='2024-11-15T17:00:42.000Z';
 const fresh='2024-11-15T17:00:40.000Z',stale='2024-11-15T16:46:00.000Z';
 const input=[[event(a,'off',stale),event(b,'on',fresh)]];
 const result=normalizeHistory(input,{demandSources:new Set(['approved'])});
 assert.deepEqual(result.engo,[{at:b,status:'on'}]);
 const prior={engo:[{at:stale,status:'off'}],temperatures:[],
  engo_readings:[{at:stale,temp:20.1,target:22,source_updated_at:stale}]};
 const combined=combine(prior,result);
 assert.equal(combined.engo.length,2);
 assert.deepEqual(combined.engo_readings,prior.engo_readings);
});

test('bathroom exporter keeps the two outlets separate and rejects reusing an entity',async()=>{
 const {bathroomMapping,bathroomReading,mergeBathrooms}=await import('../scripts/bathroom-telemetry.mjs');
 const entities={'bath.dehumidifier.relay':'binary_sensor.small','bath.bigbath.dehumidifier.relay':'binary_sensor.big',
  'bath.bigbath.dehumidifier.power_w':'sensor.big_w','room.smallbath.rh':'sensor.rh_small'};
 const mapping=bathroomMapping({entities});
 const at='2024-11-15T17:00:00.000Z',observed='2024-11-15T16:59:30.000Z';
 const data={
  'binary_sensor.small':{state:'off',last_updated:at,attributes:{observed_at:observed}},
  'binary_sensor.big':{state:'on',last_updated:at,attributes:{observed_at:observed}},
  'sensor.big_w':{state:'0.123',last_updated:at,attributes:{unit_of_measurement:'kW',device_class:'power',observed_at:observed}},
  'sensor.rh_small':{state:'64',last_updated:at,attributes:{unit_of_measurement:'%',device_class:'humidity'}}
 };
 const result=mergeBathrooms({},mapping,[],data,Date.parse(at));
 assert.deepEqual(result.smallbath.latest.relay,{at:observed,value:'off'});
 assert.deepEqual(result.bigbath.latest.relay,{at:observed,value:'on'});
 assert.equal(result.bigbath.latest.power.value,123);
 assert.equal(result.bigbath.history.power.length,1);
 assert.equal(result.smallbath.latest.humidity.value,64);
 assert.equal(result.smallbath.latest.power,undefined);
 assert.deepEqual(bathroomReading('power',{...data['sensor.big_w'],state:'unavailable'}),{at,value:null});
 assert.equal(bathroomReading('power',{...data['sensor.big_w'],attributes:{unit_of_measurement:'kWh'}}).value,null);
 assert.equal(bathroomReading('energy',{...data['sensor.big_w'],attributes:{unit_of_measurement:'kWh',device_class:'energy'}}).value,null);
 assert.throws(()=>bathroomMapping({entities:{...entities,'bath.bigbath.dehumidifier.relay':'binary_sensor.small'}}),/Niejednoznaczne/);
});

test('invalid optional bathroom data never hides pre-existing HA snapshots or history',()=>{
 const b=browser(),p=payload();
 const at=p.generated_at;
 p.dashboard={bath:{relay:{at,value:'off'},power:{at,value:0}}};
 p.bathrooms={bigbath:{latest:{power:{at,value:120}},history:{power:[{at,value:120}]}}};
 const correct=b.validate(p);
 assert.equal(correct.bathrooms.bigbath.latest.power.value,120);
 p.bathrooms.bigbath.history.power.push({at,value:121});
 const invalid=b.validate(p);
 assert.equal(invalid.bathroomError,true);
 assert.equal(invalid.dashboard.bath.power.value,0);
 assert.equal(invalid.engo.length,2);
});
