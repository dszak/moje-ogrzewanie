const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function engine(){
 const c=vm.createContext({Intl,Date});
 vm.runInContext(fs.readFileSync('public/temperatures.js','utf8'),c);
 return vm.runInContext('TemperatureHistory',c);
}
const names={
 bedroom:'sensor.setti_ss302_sypialnia_setti_sypialnia_temperatura_mqtt',
 salon:'sensor.setti_ss302_salon_setti_salon_temperatura_mqtt',
 kitchen:'sensor.setti_ss302_kuchnia_setti_kuchnia_temperatura_mqtt',
 bigbath:'sensor.setti_ss302_duza_lazienka_setti_duza_lazienka_temperatura_mqtt',
 smallbath:'sensor.setti_ss302_mala_lazienka_setti_mala_lazienka_temperatura_mqtt',
 hall:'sensor.setti_ss302_przedpokoj_setti_przedpokoj_temperatura_mqtt'
};
const row=(room,v,t)=>names[room]+','+v+','+t;
const sample=['entity_id,state,last_changed',
 row('bedroom',21.4,'2024-11-14T23:40:00.000Z'),
 row('bedroom',21.5,'2024-11-15T08:00:00.000Z'),
 row('bedroom',21.6,'2024-11-15T18:00:00.000Z'),
 row('salon',21.7,'2024-11-15T08:03:00.000Z'),
 row('kitchen',21.2,'2024-11-15T09:00:00.000Z'),
 row('bigbath',22.0,'2024-11-15T09:01:00.000Z'),
 row('smallbath',22.1,'2024-11-15T09:02:00.000Z'),
 row('hall',20.5,'2024-11-15T09:03:00.000Z')
].join('\r\n');

test('HA export maps six rooms, preserves UTC timestamps and local dates',()=>{
 const t=engine(),result=t.parse(sample);
 assert.equal(result.added,8);
 assert.equal(result.skipped,0);
 assert.equal(Object.keys(result.counts).length,6);
 assert.equal(result.rows[0].room,'bedroom');
 assert.equal(result.rows[0].at,'2024-11-14T23:40:00.000Z');
 assert.equal(t.dayKey(result.rows[0].at),'2024-11-15'); // CET
 assert.deepEqual(Array.from(t.days(result.rows)),['2024-11-15']);
 const graph=t.graph(result.rows,'2024-11-15');
 assert.equal(graph.series.length,6);
 assert.equal(graph.summary.find(s=>s.room==='bedroom').count,3);
 assert.equal(graph.summary.find(s=>s.room==='bedroom').max,21.6);
});

test('repeated HA CSV import deduplicates, conflicting values reject',()=>{
 const t=engine(),a=t.parse(sample);
 const b=t.parse(sample,a.rows);
 assert.equal(b.added,0);assert.equal(b.skipped,8);
 const changed=sample.replace('21.5,2024-11-15T08','22.9,2024-11-15T08');
 assert.throws(()=>t.parse(changed,a.rows),/inna temperatura/);
 assert.equal(a.rows.length,8);
});

test('header, entities, dates, values and unavailability are safely checked',()=>{
 const t=engine();
 assert.throws(()=>t.parse('data;godzina;stan\n2024-11-15;19:00;ON'),/kolumny/);
 assert.throws(()=>t.parse('entity_id,state,last_changed\n'+row('bedroom','bad','2024-11-15T10:00:00.000Z')),/temperatura/);
 assert.throws(()=>t.parse('entity_id,state,last_changed\n'+row('bedroom','22.0','2024-11-15T10:00:00')),/ISO/);
 const file='entity_id,state,last_changed\n'+row('bedroom','21.4','2024-11-15T10:00:00.000Z')+
   '\n'+row('bedroom','unavailable','2024-11-15T10:01:00.000Z')+
   '\nsensor.other_temperature,22,2024-11-15T10:02:00.000Z';
 const parsed=t.parse(file);assert.equal(parsed.added,1);assert.equal(parsed.unavailable,1);assert.equal(parsed.ignored,1);
 assert.throws(()=>t.parse('entity_id,state,last_changed\n'+row('bedroom','21.4','2024-11-15T10:00:00.000Z')+
   '\n'+row('bedroom','21.6','2024-11-15T10:00:00.000Z')),/inna temperatura/);
});

test('Warsaw day bounds honor DST and ENGO shading clips to day',()=>{
 const t=engine();
 const spring=t.bounds('2024-03-31'),autumn=t.bounds('2024-10-27');
 assert.equal((spring.end-spring.start)/3600000,23);
 assert.equal((autumn.end-autumn.start)/3600000,25);
 const parsed=t.parse('entity_id,state,last_changed\n'+row('bedroom','21.5','2024-11-15T10:00:00.000Z'));
 const graph=t.graph(parsed.rows,'2024-11-15',[{start:'2024-11-14T23:50:00.000Z',end:'2024-11-15T00:10:00.000Z'}]);
 assert.equal(graph.heat.length,1);
 assert.ok(graph.heat[0].start>=graph.start&&graph.heat[0].end<=graph.end);
});

test('a step chart starts at the last known previous value and does not fabricate a full-day ending',()=>{
 const t=engine();
 const samples='entity_id,state,last_changed\n'+
  row('bedroom','21.3','2024-11-14T20:00:00.000Z')+'\n'+
  row('bedroom','21.5','2024-11-15T12:00:00.000Z');
 const graph=t.graph(t.parse(samples).rows,'2024-11-15');
 const points=graph.series[0].points;
 assert.equal(points.length,2);
 assert.equal(points[0].at,graph.start);
 assert.equal(points[0].temp,21.3);
 assert.equal(points[1].temp,21.5);
 assert.ok(points.at(-1).at<graph.end);
});
