const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync('public/insights.js','utf8');
function insight(){const c=vm.createContext({Date,Intl,Map,Math,Number,Set,Error,Promise,URL});vm.runInContext(src,c);return c}
test('bulk ORLEN import validates, deduplicates and never overwrites',()=>{
 const c=insight();
 const a=vm.runInContext("Insights.importRows('2026-04-01;nowy;100\\n2026-05-01;nowy;200',[])",c);
 assert.equal(a.added,2);
 c.records=a.rows;
 const b=vm.runInContext("Insights.importRows('2026-04-01;nowy;100\\n2026-05-01;nowy;200',records)",c);
 assert.equal(b.added,0);assert.equal(b.rows.length,2);
 assert.throws(()=>vm.runInContext("Insights.importRows('2026-02-31;nowy;123',[])",c));
 assert.throws(()=>vm.runInContext("Insights.importRows('2026-02-02;unknown;123',[])",c));
});
test('old and new gas meters are never subtracted across replacement',()=>{
 const c=insight();
 const g=[{at:'2026-04-01T12:00:00Z',gas:2200,meter:'old',source:'orlen'},
 {at:'2026-05-01T12:00:00Z',gas:2228,meter:'old',source:'orlen'},
 {at:'2026-04-01T12:00:00Z',gas:80,meter:'new',source:'orlen'},
 {at:'2026-05-01T12:00:00Z',gas:248,meter:'new',source:'orlen'}];
 c.data={gasHistory:g,conditions:[],weather:{hourly:[]}};
 const intervals=vm.runInContext("Insights.intervals(data)",c);
 assert.equal(intervals.length,2);
 assert.deepEqual(Array.from(intervals,x=>x.gas).sort((a,b)=>a-b),[28,168]);
});
test('weather mean and normalized gas are based on matching hours',()=>{
 const c=insight(),start=Date.parse('2026-11-05T12:00:00Z');
 const hourly=Array.from({length:48},(_,i)=>({at:start/1000+i*3600,temp:10}));
 c.data={gasHistory:[{at:new Date(start).toISOString(),gas:100,meter:'new',source:'orlen'},{at:new Date(start+48*3600000).toISOString(),gas:112,meter:'new',source:'orlen'}],conditions:[],weather:{hourly}};
 const r=vm.runInContext("Insights.intervals(data)[0]",c);
 assert.equal(r.gas,12);assert.equal(r.days,2);assert.equal(r.perDay,6);assert.equal(r.avg,10);
 assert.equal(r.dd,23);assert.ok(Math.abs(r.normalized-12/23)<1e-7);
});
test('weather update retains prior hours when only recent forecast endpoint is available',async()=>{
 const c=insight();const now=Date.parse('2026-11-14T10:00:00Z');
 const existing={hourly:[{at:Math.floor(now/1000)-100*86400,temp:5}],updated:null};
 c.old=existing;c.clock=now;
 const fresh=await vm.runInContext("Insights.refresh(old,async u=>{if(u.includes('archive-api'))throw Error('offline archive');return {ok:true,json:async()=>({hourly:{time:[Math.floor(clock/1000)-3600],temperature_2m:[8.5]}})}} ,clock)",c);
 assert.equal(fresh.hourly.length,2);assert.equal(fresh.hourly.at(-1).temp,8.5);
});

test('short gas intervals keep gas usage but do not extrapolate to m³ per day',()=>{
 const c=insight(),start=Date.parse('2026-11-14T06:00:00Z');
 const hourly=Array.from({length:3},(_,i)=>({at:start/1000+i*3600,temp:3}));
 c.data={gasHistory:[{at:new Date(start).toISOString(),gas:500,meter:'new',source:'manual'},{at:new Date(start+2*3600000).toISOString(),gas:501.1,meter:'new',source:'manual'}],conditions:[],weather:{hourly}};
 const r=vm.runInContext('Insights.intervals(data)[0]',c);
 assert.ok(Math.abs(r.gas-1.1)<1e-7);
 assert.equal(r.perDay,null);
 assert.equal(r.normalized,null);
 assert.ok(r.days<0.75);
});
