const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function init(){
 const ctx=vm.createContext({Date,Intl});
 for(const name of ['public/engo.js','public/review.js']){
   vm.runInContext(fs.readFileSync(name,'utf8'),ctx);
 }
 return vm.runInContext('HeatingReview',ctx);
}
const rooms=['bedroom','salon','kitchen','bigbath','smallbath','hall'];
function data(){
 return {
  global:{boiler:55,engo:22,engoCurrent:null,electric:null},
  rooms:Object.fromEntries(rooms.map(id=>[id,{target:id==='bedroom'?22:21.5,readings:[]}])),
  radiators:{},temperatureHistory:[
   {room:'bedroom',at:'2024-11-14T12:00:00.000Z',temp:21.2},
   {room:'bedroom',at:'2024-11-15T16:10:00.000Z',temp:21.5},
   {room:'bedroom',at:'2024-11-15T16:50:00.000Z',temp:21.6},
   {room:'salon',at:'2024-11-15T16:40:00.000Z',temp:21.7}
  ],
  engoCycles:[
   {id:'on',at:'2024-11-15T16:12:00.000Z',status:'on',source:'import'},
   {id:'off',at:'2024-11-15T16:18:00.000Z',status:'off',source:'import'}
  ],
  gasHistory:[
    {at:'2024-11-14T20:00:00.000Z',gas:100,meter:'new',source:'manual'},
    {at:'2024-11-15T07:00:00.000Z',gas:104,meter:'new',source:'manual'},
    {at:'2024-11-15T20:00:00.000Z',gas:107,meter:'new',source:'manual'},
    {at:'2024-11-15T18:00:00.000Z',gas:999,meter:'old',source:'manual'}
  ],
  weather:{hourly:[{at:Date.parse('2024-11-15T16:00:00.000Z')/1000,temp:8}],updated:'2024-11-15T19:00:00.000Z'},
  conditions:[],boilerReadings:[{at:'2024-11-15T08:00:00.000Z',ac001:10000,ac005:2000,ac006:100,note:''}],
  heatingEvents:[],experiments:[],decisionLog:[]
 };
}
const now=Date.parse('2024-11-15T20:20:00.000Z');

test('report is self-contained and uses actual readings within 24-hour bounds',()=>{
 const r=init().build(data(),'day',{},now);
 assert.equal(r.format_version,1);
 assert.equal(r.period.hours,24);
 assert.equal(r.temperature_history.rooms.find(x=>x.room==='bedroom').count,2);
 assert.equal(r.temperature_history.rooms.find(x=>x.room==='bedroom').min_c,21.5);
 assert.equal(r.temperature_history.rooms.find(x=>x.room==='bedroom').previous_known_value.temp_c,21.2);
 assert.equal(r.engo.events.length,2);
 assert.equal(r.engo.completed_pairs_fully_in_period.length,1);
 assert.equal(r.engo.completed_minutes_fully_in_period,6);
 assert.equal(r.boiler_counters.readings[0].ac001_powered_hours,10000);
 assert.match(r.readable_summary,/6 min/);
 assert.match(r.instructions_for_analysis,/Oddziel fakty/);
});

test('report separates gas meters and does not infer exact daily usage or burner runtime',()=>{
 const r=init().build(data(),'day',{},now);
 const newer=r.gas.meters.new,older=r.gas.meters.old;
 assert.equal(newer.readings.length,2);
 assert.equal(older.readings.length,1);
 assert.equal(newer.previous_known_reading.gas_m3,100);
 assert.equal(newer.intervals_between_readings_in_period.length,1);
 assert.equal(newer.intervals_between_readings_in_period[0].total_gas_m3,3);
 assert.equal(older.intervals_between_readings_in_period.length,0);
 assert.ok(r.interpretation_limitations.some(x=>x.includes('NIE zmierzony czas palnika')));
 assert.ok(!JSON.stringify(r).includes('estimated_daily_gas_m3'));
});

test('private map, secrets and unrelated application event history cannot leak into report',()=>{
 const s=data();
 s.privateMap='SECRET_PRIVATE_MAP_123';s.events=[{detail:'SECRET_PRIVATE_EVENT_456'}];
 s.credential='SECRET_CREDENTIAL_789';
 const r=init().build(s,'week',{},now);
 const raw=JSON.stringify(r);
 assert.ok(!raw.includes('SECRET_PRIVATE_MAP_123'));
 assert.ok(!raw.includes('SECRET_PRIVATE_EVENT_456'));
 assert.ok(!raw.includes('SECRET_CREDENTIAL_789'));
 assert.equal(r.outdoor_weather.hours_available,1);
 assert.equal(r.outdoor_weather.hours_expected,168);
 assert.ok(r.outdoor_weather.coverage_percent<75);
});

test('report warns of missing readings instead of guessing',()=>{
 const s=data();s.temperatureHistory=[];s.engoCycles=[];s.gasHistory=[];s.weather={hourly:[],updated:null};
 const report=init().build(s,'day',{},now);
 assert.equal(report.temperature_history.rooms.reduce((n,r)=>n+r.count,0),0);
 assert.equal(report.engo.completed_minutes_fully_in_period,0);
 assert.equal(report.gas.meters.new.intervals_between_readings_in_period.length,0);
 assert.ok(report.interpretation_limitations.some(x=>x.includes('zużycie gazu nieznane')));
 assert.ok(report.interpretation_limitations.some(x=>x.includes('Brak zmian temperatury')));
});

test('period selection and live snapshot freshness are labelled',()=>{
 const r=init(),s=data();
 assert.equal(r.bounds('day',now).hours,24);
 assert.equal(r.bounds('week',now).hours,168);
 assert.equal(r.bounds('month',now).hours,720);
 assert.throws(()=>r.bounds('year',now),/okres/);
 const out=r.build(s,'week',{setti:{fresh:false,at:'2024-11-14T00:00:00Z',data:{last_sync:'2024-11-14T00:00:00Z'}},
  heads:{fresh:true,at:'2024-11-15T20:20:00Z',data:{heads:{}}}},now);
 assert.equal(out.latest_live_status.setti.fresh,false);
 assert.equal(out.latest_live_status.radiator_heads.fresh,true);
 assert.match(out.latest_live_status.note,/Migawki/);
});
