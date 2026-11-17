const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('public/storage.js','utf8')+'\n'+fs.readFileSync('public/insights.js','utf8')+'\n'+fs.readFileSync('public/engo.js','utf8')+'\n'+fs.readFileSync('public/temperatures.js','utf8')+'\n'+fs.readFileSync('public/temperature-view.js','utf8')+'\n'+fs.readFileSync('public/research.js','utf8')+'\n'+fs.readFileSync('public/memory.js','utf8')+'\n'+fs.readFileSync('public/memory-view.js','utf8')+'\n'+fs.readFileSync('public/review.js','utf8')+'\n'+fs.readFileSync('public/review-view.js','utf8')+'\n'+fs.readFileSync('public/setti.js','utf8')+'\n'+fs.readFileSync('public/heads.js','utf8')+'\n'+fs.readFileSync('public/ha-sync.js','utf8')+'\n'+fs.readFileSync('public/app.js','utf8');
function boot(initial={}){
 const data=new Map(Object.entries(initial)),elements=new Map(),listeners={};
 let quota=false,allowConfirm=true;
 const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem(k,v){if(quota)throw Error('quota');data.set(k,v)}};
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',hidden:true,style:{},addEventListener(){},focus(){}});return elements.get(id)};
 const ctx=vm.createContext({localStorage:storage,document:{getElementById:element,addEventListener:(n,f)=>listeners[n]=f,createElement:()=>({style:{}}),body:{appendChild(){}}},navigator:{},window:{addEventListener(){}},location:{protocol:'https:'},setTimeout:()=>0,clearTimeout(){},scrollTo(){},confirm:()=>allowConfirm,alert(){},console,Blob,URL});
 vm.runInContext(source,ctx);
 return {run:s=>vm.runInContext(s,ctx),data,elements,listeners,element,setQuota:v=>quota=v,setConfirm:v=>allowConfirm=v};
}
const KEY='moje-ogrzewanie-data-v1';
test('six rooms, eight heads, doors, all screens render',()=>{
 const b=boot();assert.equal(b.run('ROOMS.length'),6);assert.equal(b.run('Object.keys(RADS).length'),8);
 for(const page of ['home','heads','boiler','engo-cycles','temperatures','review','memory','insights','experiments','history','map','settings'])b.run(`setPage('${page}')`);
 for(const r of ['bedroom','salon','kitchen','bigbath','smallbath','hall'])b.run(`setPage('room','${r}')`);
 assert.equal(b.run('Object.keys(DOORS).length'),6);
});
test('original v1 migration and JSON roundtrip preserve records',()=>{
 const a=boot();a.run("state.rooms.bedroom.readings.push({at:now(),temp:21.7,humidity:42,note:'Test'});state.global.engoPlace='Moje miejsce';changeLog('Test','Dane');save()");
 const raw=a.data.get(KEY);const b=boot({'moje-ogrzewanie-legacy-v1':raw});
 assert.equal(b.run('last("bedroom").temp'),21.7);assert.equal(b.run('state.global.engoPlace'),'Moje miejsce');assert.equal(b.data.get(KEY),raw);
 const c=boot(Object.fromEntries(b.data));assert.equal(c.run('state.events.length'),1);
});
test('quota failure rolls back and never shows successful write',()=>{
 const b=boot();b.run('save()');const before=b.data.get(KEY);b.setQuota(true);
 b.run("guarded(()=>{state.global.boiler=60;save();toast('Zapisano')})()");
 assert.equal(b.data.get(KEY),before);assert.equal(b.run('state.global.boiler'),55);assert.match(b.element('storageAlert').textContent,/Nie zapisano/);
});
test('previous snapshot survives import and can be restored',()=>{
 const b=boot();b.run('save();state.global.boiler=60;save();state=DataStore.recover()');assert.equal(b.run('state.global.boiler'),55);
 b.run('let imported=seed();imported.global.boiler=62;DataStore.replace(imported);state=DataStore.recover()');assert.equal(b.run('state.global.boiler'),55);
});
test('corrupt records are kept and protected from overwrite',()=>{
 const b=boot({[KEY]:'broken'});assert.throws(()=>b.run('save()'));assert.equal(b.data.get(KEY),'broken');assert.ok(b.run('DataStore.warning'));
});
test('incompatible, incomplete and unsafe import values are rejected',()=>{
 const b=boot();for(const change of ["p.version=2","p.rooms.bedroom.readings=[{temp:'<img>'}]","p.doors['bed-hall']='bad'","p.global.boiler='55'","p.privateMap='https://example.com/private.svg'","p.experiments=[{status:'done'}]"]){assert.throws(()=>b.run(`{const p=seed();${change};DataStore.validate(p)}`))}
 assert.equal(b.run('{const p=seed();delete p.conditions;DataStore.validate(p).conditions.length}'),0);
});
test('concurrent tabs cannot silently overwrite newer data',()=>{
 const b=boot();b.run('save()');b.data.set(KEY,b.data.get(KEY).replace('"boiler":55','"boiler":63'));assert.throws(()=>b.run('state.global.boiler=60;save()'));assert.match(b.data.get(KEY),/"boiler":63/);
});
test('history is not truncated, text and CSV are escaped',()=>{
 const b=boot();b.run("for(let i=0;i<1100;i++)changeLog('Test','Wpis');save()");assert.equal(b.run('state.events.length'),1100);
 assert.equal(b.run("esc('<img onerror=alert(1)>')"),'&lt;img onerror=alert(1)&gt;');assert.equal(b.run("csvCell('=1+1')"),'"\'=1+1"');
 b.run("setPage('history')");assert.match(b.element('view').innerHTML,/Pokaż starsze/);
});
test('experiment lifecycle snapshots, target and measurement actions persist',()=>{
 const b=boot();const click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 b.element('target').value='21.5';click('save-target',{room:'salon'});assert.equal(b.run('state.rooms.salon.target'),21.5);
 b.element('tempReading').value='20.8';b.element('humidityReading').value='45';b.element('readNote').value='Pomiar';click('reading',{room:'salon'});assert.equal(b.run('last("salon").temp'),20.8);
 b.element('expTitle').value='Próba';b.element('expDescription').value='Jedna zmiana';click('start-exp');const id=b.run('state.experiments[0].id');b.element('finishNotes').value='Gotowe';click('finish-exp',{id});assert.equal(b.run('state.experiments[0].status'),'done');b.run('DataStore.validate(state)');
});
test('door, radiator, ENGO, boiler and gas entries persist',()=>{
 const b=boot();const click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 b.element('rad-G7').value='23';b.element('rad-G8').value='22';click('save-radiators',{room:'bedroom'});
 b.element('boilerSet').value='56';click('set-boiler');b.element('engoSet').value='22.5';b.element('engoCurrent').value='21.8';b.element('engoPlace').value='Test';click('set-engo');
 b.listeners.change({target:{dataset:{change:'door',id:'bed-hall'},value:'ajar'}});
 b.element('outdoor').value='4';b.element('gas').value='123.456';b.element('sky').value='clouds';click('record-conditions');
 const c=boot(Object.fromEntries(b.data));assert.equal(c.run('state.radiators.G7'),23);assert.equal(c.run('state.global.boiler'),56);assert.equal(c.run('state.global.engo'),22.5);assert.equal(c.run("state.doors['bed-hall']"),'ajar');assert.equal(c.run('state.conditions[0].gas'),123.456);
});

test('new gas and ENGO history forms save without touching existing observations',()=>{
 const b=boot();b.run("state.conditions.push({at:'2026-11-01T10:00:00Z',outdoor:4,gas:500,sky:'clouds'});save()");
 const click=(action)=>b.listeners.click({target:{closest:()=>({dataset:{action}})}});
 b.element('gasAt').value='2026-11-05T12:00';b.element('gasMeter').value='new';b.element('gasSource').value='orlen';b.element('gasValue').value='641';
 click('add-gas');assert.equal(b.run('state.gasHistory.length'),1);
 b.element('engoAt').value='2026-11-05T12:00';b.element('engoHistoryValue').value='22';b.element('engoHistoryNote').value='Ustawienie';
 click('add-engo-history');assert.equal(b.run('state.heatingEvents.length'),1);
 b.element('gasBulk').value='2026-04-01;nowy;100\n2026-05-01;nowy;200';click('bulk-gas');
 assert.equal(b.run('state.gasHistory.length'),3);assert.equal(b.run('state.conditions.length'),1);
 const roundtrip=boot(Object.fromEntries(b.data));
 assert.equal(roundtrip.run('state.heatingEvents.length'),1);assert.equal(roundtrip.run('state.gasHistory.length'),3);
});

test('room wording and automatic weather do not require a manual outdoor field',()=>{
 const b=boot();b.run("setPage('room','smallbath')");
 assert.match(b.element('view').innerHTML,/Chcę mieć w pomieszczeniu/);
 b.run("setPage('home')");
 assert.doesNotMatch(b.element('view').innerHTML,/id="outdoor"/);
 b.element('gas').value='500.125';b.element('sky').value='unknown';
 b.listeners.click({target:{closest:()=>({dataset:{action:'record-conditions'}})}});
 assert.equal(b.run('state.conditions.length'),1);
 assert.equal(b.run('state.conditions[0].gas'),500.125);
 assert.equal(b.run('state.conditions[0].outdoor'),null);
 b.run("setPage('insights')");
 assert.match(b.element('view').innerHTML,/Gaz i pogoda/);
});


test('fresh public Setti measurements display without overwriting manual readings and attach to a current gas log', async()=>{
  const b=boot();
  const rooms={};
  for(const id of ['bedroom','salon','kitchen','bigbath','smallbath','hall'])rooms[id]={temperature:21.6,humidity:51};
  const payload={version:1,last_sync:new Date().toISOString(),rooms};
  await b.run('Setti.refresh(async()=>({ok:true,json:async()=>('+JSON.stringify(payload)+')}))');
  b.run("setPage('home')");
  assert.match(b.element('view').innerHTML,/Setti\+ automatycznie/);
  assert.equal(b.run('latestReading("bedroom").temp'),21.6);
  assert.equal(b.run('state.rooms.bedroom.readings.length'),0);

  b.element('gasAt').value=b.run('dateLocal(Date.now())');
  b.element('gasMeter').value='new';
  b.element('gasSource').value='manual';
  b.element('gasValue').value='735.2';
  b.listeners.click({target:{closest:()=>({dataset:{action:'add-gas'}})}});
  assert.equal(b.run('state.gasHistory.length'),1);
  assert.equal(b.run('state.gasHistory[0].setti.rooms.bedroom.temperature'),21.6);
  b.run('DataStore.validate(state)');
  const restored=boot(Object.fromEntries(b.data));
  assert.equal(restored.run('state.gasHistory[0].setti.rooms.hall.humidity'),51);
  restored.run("setPage('insights')");
  assert.match(restored.element('view').innerHTML,/6 pomiarów/);
});
test('historical ORLEN entries and stale sensor readings do not acquire current snapshots', async()=>{
  const b=boot();
  const rooms={};
  for(const id of ['bedroom','salon','kitchen','bigbath','smallbath','hall'])rooms[id]={temperature:21.6,humidity:51};
  const payload={version:1,last_sync:new Date(Date.now()-30*60000).toISOString(),rooms};
  await b.run('Setti.refresh(async()=>({ok:true,json:async()=>('+JSON.stringify(payload)+')}))');
  b.element('gasAt').value='2026-05-01T12:00';
  b.element('gasMeter').value='new';
  b.element('gasSource').value='orlen';
  b.element('gasValue').value='702';
  b.listeners.click({target:{closest:()=>({dataset:{action:'add-gas'}})}});
  assert.equal(b.run('state.gasHistory.length'),1);
  assert.equal(b.run('state.gasHistory[0].setti'),undefined);
  assert.throws(()=>b.run("{let bad=seed();bad.gasHistory.push({id:'x',at:now(),gas:1,meter:'new',source:'manual',setti:{version:1,last_sync:now(),rooms:{}}});DataStore.validate(bad)}"));
});


test('gas history mobile cards show full meter reading and all saved Setti+ rooms',()=>{
 const b=boot();
 const ids=['bedroom','salon','kitchen','bigbath','smallbath','hall'];
 const rooms=Object.fromEntries(ids.map((id,i)=>[id,{temperature:20.5+i*.2,humidity:46+i}]));
 const entries=[
   {id:'g-new',at:'2026-11-14T20:00:00Z',gas:739.733,meter:'new',source:'manual',
    setti:{version:1,last_sync:'2026-11-14T19:51:00Z',rooms}},
   {id:'g-old',at:'2026-10-14T12:00:00Z',gas:680.125,meter:'old',source:'orlen'}
 ];
 b.run('state.gasHistory.push(...'+JSON.stringify(entries)+');save()');
 const before=b.data.get(KEY);
 b.run("setPage('insights')");
 const view=b.element('view').innerHTML;
 assert.match(view,/class="table-scroll gas-history-table-wrap"/);
 assert.match(view,/class="gas-history-mobile"/);
 assert.match(view,/class="gas-history-entry"/);
 assert.match(view,/739,733/);
 assert.match(view,/680,125/);
 assert.match(view,/Nowy gazomierz/);
 assert.match(view,/Stary gazomierz/);
 assert.match(view,/Źródło: Odczyt ręczny/);
 assert.match(view,/Źródło: ORLEN/);
 assert.match(view,/6 pomiarów Setti\+/);
 assert.match(view,/Synchronizacja: 14\.11\.2026/);
 assert.equal((view.match(/class="gas-history-entry-room"/g)||[]).length,6);
 for(const label of ['Sypialnia','Salon','Kuchnia','Duża łazienka','Mała łazienka','Przedpokój'])
   assert.ok(view.includes(label));
 assert.match(view,/Brak dołączonych pomiarów Setti\+/);
 assert.equal(b.data.get(KEY),before,'rendering does not write or migrate user data');
 b.run('DataStore.validate(state)');
 const reloaded=boot(Object.fromEntries(b.data));
 assert.equal(reloaded.run('state.gasHistory[0].setti.rooms.salon.humidity'),47);
 assert.equal(reloaded.run('state.gasHistory[1].setti'),undefined);
});

test('narrow screens use gas cards while desktop keeps a scrollable table',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/\.gas-history-mobile\{display:none\}/);
 assert.match(html,/@media\(max-width:640px\)\{[\s\S]*?\.gas-history-table-wrap\{display:none\}/);
 assert.match(html,/@media\(max-width:640px\)\{[\s\S]*?\.gas-history-mobile\{display:grid;gap:12px\}/);
 assert.match(html,/\.gas-history-entry-rooms\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/\.gas-history-entry-value\{[^}]*white-space:nowrap/);
});

test('head screen shows eight validated readings without changing local data or history', async () => {
  const b=boot(), when=new Date().toISOString();
  const heads={};
  for(let i=1;i<=8;i++)heads['g'+i]={temperature:21+i/10,target_temperature:22,calibration:-1,mode_raw:'standy'};
  const payload={version:1,last_sync:when,heads};
  await b.run('Heads.refresh(async()=>({ok:true,json:async()=>('+JSON.stringify(payload)+')}))');
  const before=b.data.get(KEY);
  b.run("setPage('heads')");
  const view=b.element('view').innerHTML;
  assert.match(view,/Panel ogrzewania/);
  assert.equal((view.match(/class="panel-head"/g)||[]).length,8);
  assert.match(view,/Tryb:/);
  assert.match(view,/21,1°C/);
  assert.match(view,/Odśwież głowice/);
  assert.equal(b.data.get(KEY),before);
  assert.equal(b.run('state.events.length'),0);
});

test('gas readings can be edited and deleted while unrelated weather observations remain',()=>{
 const b=boot(),click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 b.run("state.conditions.push({at:'2026-11-14T06:00:00Z',gas:500,outdoor:4,sky:'clouds',meter:'new'});state.gasHistory.push({id:'g-test',at:'2026-11-15T06:00:00Z',gas:505,meter:'new',source:'manual'});save()");
 click('edit-gas',{kind:'history',index:'0'});
 assert.match(b.element('view').innerHTML,/Popraw odczyt gazomierza/);
 b.element('editGasAt').value='2026-11-15T06:00';
 b.element('editGasMeter').value='new';
 b.element('editGasSource').value='manual';
 b.element('editGasValue').value='506.123';
 click('save-gas-edit');
 assert.equal(b.run('state.gasHistory[0].gas'),506.123);
 assert.equal(b.run('state.gasHistory.length'),1);
 assert.match(b.run('state.events[0].label'),/Poprawiono/);
 click('delete-gas',{kind:'condition',index:'0'});
 assert.equal(b.run('state.conditions.length'),1);
 assert.equal(b.run('state.conditions[0].gas'),null);
 assert.equal(b.run("state.conditions[0].sky"),'clouds');
 assert.equal(b.run('state.gasHistory.length'),1);
 click('delete-gas',{kind:'history',index:'0'});
 assert.equal(b.run('state.gasHistory.length'),0);
 b.run('DataStore.validate(state)');
 const again=boot(Object.fromEntries(b.data));
 assert.equal(again.run('state.conditions[0].sky'),'clouds');
 assert.equal(again.run('state.conditions[0].gas'),null);
 assert.equal(again.run('state.events.length'),3);
});

test('daily gas comparisons are visible despite intermediate measurements',()=>{
 const b=boot();
 const list=[
 {id:'a',at:'2026-11-14T06:47:00Z',gas:100,meter:'new',source:'manual'},
 {id:'b',at:'2026-11-14T08:57:00Z',gas:101,meter:'new',source:'manual'},
 {id:'c',at:'2026-11-14T20:00:00Z',gas:105,meter:'new',source:'manual'},
 {id:'d',at:'2026-11-15T06:55:00Z',gas:108,meter:'new',source:'manual'}
 ];
 b.run('state.gasHistory.push(...'+JSON.stringify(list)+');save()');
 b.run("setPage('insights')");
 assert.match(b.element('view').innerHTML,/Porównania dobowe/);
 assert.match(b.element('view').innerHTML,/7,96 m³\/dobę/);
 assert.match(b.element('view').innerHTML,/Edytuj/);
 assert.match(b.element('view').innerHTML,/Usuń/);
});

test('cancelling gas confirmation does not write data',()=>{
 const b=boot(),click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 b.run('save()');
 const baseline=b.data.get(KEY);
 b.setConfirm(false);
 b.element('gasAt').value='2026-11-15T09:00';b.element('gasMeter').value='new';
 b.element('gasSource').value='manual';b.element('gasValue').value='125.4';
 click('add-gas');
 assert.equal(b.data.get(KEY),baseline);
 assert.equal(b.run('state.gasHistory.length'),0);
 b.setConfirm(true);
 click('add-gas');
 assert.equal(b.run('state.gasHistory.length'),1);
 const recorded=b.data.get(KEY);
 b.setConfirm(false);
 click('delete-gas',{kind:'history',index:'0'});
 assert.equal(b.data.get(KEY),recorded);
 assert.equal(b.run('state.gasHistory.length'),1);
});

test('weather fallback never shows the raw hourly sample count as temperature',()=>{
 const b=boot();
 b.run("state.weather={hourly:[{at:Math.floor(Date.now()/1000)-2*86400,temp:7}],updated:new Date(Date.now()-24*3600000).toISOString()}");
 const info=b.run('weatherStatus()');
 assert.match(info,/Katowice: brak aktualnej temperatury/);
 assert.doesNotMatch(info,/Dane godzinowe:/);
 b.run("setPage('home')");
 const home=b.element('view').innerHTML;
 assert.match(home,/brak aktualnej temperatury/);
 assert.doesNotMatch(home,/Dane godzinowe:/);
 b.run("state.weather={hourly:[{at:Math.floor(Date.now()/1000/3600)*3600,temp:7}],updated:now()}");
 assert.match(b.run('weatherStatus()'),/7,0°C/);
});

test('stale Setti readings show last automatic values and time, not the older manual entry',async()=>{
 const b=boot();
 b.run("state.rooms.bedroom.readings.push({at:'2026-11-14T06:00:00Z',temp:19.5,humidity:43,note:'ręcznie'});save()");
 const before=b.data.get(KEY);
 const rooms=Object.fromEntries(['bedroom','salon','kitchen','bigbath','smallbath','hall'].map(id=>[id,{temperature:21.6,humidity:49}]));
 const data={version:1,last_sync:new Date(Date.now()-50*60000).toISOString(),rooms};
 await b.run('Setti.refresh(async()=>({ok:true,json:async()=>('+JSON.stringify(data)+')}))');
 assert.equal(b.run('Setti.room("bedroom")'),null);
 assert.equal(b.run('Setti.snapshot()'),null);
 assert.equal(b.run('latestReading("bedroom").temp'),21.6);
 assert.equal(b.run('delta("bedroom")'),null);
 b.run("setPage('home')");
 const home=b.element('view').innerHTML;
 assert.match(home,/21,6°C/);
 assert.match(home,/Setti\+ · nieaktualne/);
 assert.match(home,/Nieaktualny pomiar z/);
 b.run("setPage('heads')");
 assert.match(b.element('view').innerHTML,/Setti\+ · nieaktualne/);
 assert.match(b.element('view').innerHTML,/Ostatni automatyczny pomiar:/);
 b.run("setPage('room','bedroom')");
 assert.match(b.element('view').innerHTML,/Setti\+ \(nieaktualne\):/);
 assert.match(b.element('view').innerHTML,/Nie oceniaj na jego podstawie/);
 assert.equal(b.data.get(KEY),before);
});

test('boiler counters: add, compare, correct and delete without changing original gas history',()=>{
 const b=boot(),click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}}); 
 b.run("state.gasHistory.push({id:'old-meter',at:'2026-11-13T14:00:00Z',gas:450,meter:'new',source:'manual'});save()");
 const firstSnapshot=b.run("JSON.stringify(state.gasHistory)");
 b.run("setPage('boiler')");
 assert.match(b.element('view').innerHTML,/Liczniki BRÖTJE/);
 b.element('boilerAt').value='2026-11-01T14:00';
 b.element('boilerAc001').value='20000';
 b.element('boilerAc005').value='50000';
 b.element('boilerAc006').value='1000';
 b.element('boilerNote').value='Pierwszy odczyt';
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),1);
 assert.equal(b.run('state.boilerReadings[0].ac005'),50000);
 assert.match(b.element('view').innerHTML,/Pierwszy odczyt/);
 assert.equal(b.run("JSON.stringify(state.gasHistory)"),firstSnapshot);
 b.element('boilerAt').value='2026-11-08T14:00';
 b.element('boilerAc001').value='20168';
 b.element('boilerAc005').value='50250';
 b.element('boilerAc006').value='1030';
 b.element('boilerNote').value='Tydzień później';
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),2);
 assert.equal(b.run("boilerGain(...boilerEntries(),'ac005')"),250);
 assert.match(b.element('view').innerHTML,/Przyrost od/);
 assert.match(b.element('view').innerHTML,/250/);
 const id=b.run('boilerEntries().at(-1).id');
 click('edit-boiler',{id});
 assert.match(b.element('view').innerHTML,/Popraw odczyt liczników/);
 b.element('boilerAc005').value='50260';
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),2);
 assert.equal(b.run("boilerGain(...boilerEntries(),'ac005')"),260);
 b.run('DataStore.validate(state)');
 const again=boot(Object.fromEntries(b.data));
 again.run("setPage('boiler')");
 assert.equal(again.run('state.boilerReadings.length'),2);
 assert.equal(again.run("boilerGain(...boilerEntries(),'ac005')"),260);
 const still=again.run("JSON.stringify(state.gasHistory)");
 assert.equal(still,firstSnapshot);
 const prior=b.data.get(KEY);
 b.setConfirm(false);
 click('delete-boiler',{id});
 assert.equal(b.data.get(KEY),prior);
 b.setConfirm(true);
 click('delete-boiler',{id});
 assert.equal(b.run('state.boilerReadings.length'),1);
 assert.equal(b.run("JSON.stringify(state.gasHistory)"),firstSnapshot);
 assert.match(b.run('state.events[0].label'),/Usunięto/);
});

test('boiler counter input validation and negative counter increments are safe',()=>{
 const b=boot(),click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}}); 
 b.run("setPage('boiler')");
 b.element('boilerAt').value='2026-11-15T14:00';
 b.element('boilerAc001').value='13.4';
 b.element('boilerAc005').value='200';
 b.element('boilerAc006').value='50';
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),0);
 b.element('boilerAc001').value='12';
 b.setConfirm(false);
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),0);
 b.setConfirm(true);
 click('save-boiler');
 assert.equal(b.run('state.boilerReadings.length'),1);
 const before=b.data.get(KEY);
 b.element('boilerAt').value='2026-11-15T14:00';
 click('save-boiler');
 assert.equal(b.data.get(KEY),before,'duplicate timestamp does not overwrite history');
 assert.equal(b.run("boilerGain({ac005:20},{ac005:10},'ac005')"),null);
 assert.equal(b.run("boilerGain({ac005:20},{ac005:30},'ac005')"),10);
 assert.match(b.element('view').innerHTML,/godziny zasilania elektrycznego/);
 assert.doesNotMatch(b.element('view').innerHTML,/dokładne zużycie gazu/);
});

test('legacy backups without boilerReadings remain valid; extra data are preserved on import',()=>{
 const b=boot();
 const old=b.run('seed()');
 delete old.boilerReadings;
 old.gasHistory.push({id:'old',at:'2026-10-01T08:00:00Z',gas:123,meter:'new',source:'manual'});
 const validated=b.run('DataStore.validate('+JSON.stringify(old)+')');
 assert.equal(validated.boilerReadings.length,0);
 assert.equal(validated.gasHistory.length,1);
 assert.equal(b.run('DataStore.validate({...seed(),boilerReadings:[{id:"a",at:now(),ac001:1,ac005:2,ac006:3,note:"ok"}]}).boilerReadings.length'),1);
 assert.throws(()=>b.run('DataStore.validate({...seed(),boilerReadings:[{id:"a",at:now(),ac001:1.5,ac005:2,ac006:3,note:"ok"}]})'));
 assert.throws(()=>b.run('DataStore.validate({...seed(),boilerReadings:[{id:"a",at:now(),ac001:1,ac005:-2,ac006:3,note:"ok"}]})'));
});

test('boiler counter reading cards remain responsive on phone-sized screens',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/@media\(max-width:560px\)\{\.cols3\{grid-template-columns:1fr\}/);
 const b=boot();
 b.run("setPage('boiler')");
 const view=b.element('view').innerHTML;
 assert.match(view,/class="grid cols2"/);
 assert.match(view,/id="boilerAc001"/);
 assert.match(view,/id="boilerAc005"/);
 assert.match(view,/id="boilerAc006"/);
 assert.match(view,/inputmode="numeric"/);
});


test('ENGO screenshot CSV previews, imports privately, deduplicates and survives reload',()=>{
 const b=boot();const click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 const text='data;godzina;stan\n2024-11-15;17:12;ON\n2024-11-15;17:18;OFF\n2024-11-15;17:31;ON\n2024-11-15;17:46;OFF';
 b.run("setPage('engo-cycles')");
 b.element('engoBulk').value=text;
 click('preview-engo');
 assert.equal(b.run('state.engoCycles.length'),0,'preview never writes');
 assert.match(b.element('view').innerHTML,/Nowe: 4/);
 click('confirm-engo-import');
 assert.equal(b.run('state.engoCycles.length'),4);
 assert.equal(b.run('EngoCycles.analyze(state.engoCycles).totalMinutes'),21);
 const c=boot(Object.fromEntries(b.data));
 assert.equal(c.run('state.engoCycles.length'),4);
 const again=(action,extra={})=>c.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 c.run("setPage('engo-cycles')");c.element('engoBulk').value=text;again('preview-engo');
 assert.match(c.element('view').innerHTML,/Pominięte duplikaty: 4/);
 assert.equal(c.run('state.engoCycles.length'),4);
 const id=c.run('state.engoCycles[0].id');
 again('edit-engo',{id});
 c.element('engoEditAt').value='2024-11-15T17:13';c.element('engoEditStatus').value='on';
 again('save-engo-edit');
 assert.equal(c.run('state.engoCycles[0].at'),'2024-11-15T16:13:00.000Z');
 again('delete-engo',{id});
 assert.equal(c.run('state.engoCycles.length'),3);
});

test('ENGO entries remain optional for older v1 data and reject invalid history',()=>{
 const b=boot();
 assert.equal(b.run('{const p=seed();delete p.engoCycles;DataStore.validate(p).engoCycles.length}'),0);
 assert.throws(()=>b.run("{const p=seed();p.engoCycles.push({id:'bad',at:'2024-11-15T16:12:00.000Z',status:'other',source:'import'});DataStore.validate(p)}"));
 assert.throws(()=>b.run("{const p=seed();p.engoCycles.push({id:'a',at:'2024-11-15T16:12:00.000Z',status:'on',source:'import'},{id:'b',at:'2024-11-15T16:12:05.000Z',status:'off',source:'import'});DataStore.validate(p)}"));
});


test('HA temperature CSV previews, saves without replacing ENGO or gas, supports repeated imports',()=>{
 const b=boot();const click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 const csv='entity_id,state,last_changed\n'+
 'sensor.setti_ss302_sypialnia_setti_sypialnia_temperatura_mqtt,21.5,2024-11-15T16:10:00.000Z\n'+
 'sensor.setti_ss302_salon_setti_salon_temperatura_mqtt,21.7,2024-11-15T16:15:00.000Z\n'+
 'sensor.setti_ss302_sypialnia_setti_sypialnia_temperatura_mqtt,21.6,2024-11-15T16:20:00.000Z';
 b.run("state.engoCycles=EngoCycles.parse('2024-11-15;17:12;ON\\n2024-11-15;17:18;OFF').rows;state.gasHistory.push({id:'test',at:'2024-11-15T16:00:00.000Z',gas:700,meter:'new',source:'manual'});save();setPage('temperatures')");
 b.element('tempBulk').value=csv;click('temp-preview');
 assert.match(b.element('view').innerHTML,/Nowe wpisy/);
 assert.equal(b.run('state.temperatureHistory.length'),0,'preview is read-only');
 click('temp-confirm');
 assert.equal(b.run('state.temperatureHistory.length'),3);
 assert.equal(b.run('state.engoCycles.length'),2);
 assert.equal(b.run('state.gasHistory.length'),1);
 const again=boot(Object.fromEntries(b.data));
 assert.equal(again.run('state.temperatureHistory.length'),3);
 assert.equal(again.run('state.engoCycles.length'),2);
 again.run("setPage('temperatures')");
 assert.match(again.element('view').innerHTML,/temp-chart/);
 again.element('tempBulk').value=csv;
 again.listeners.click({target:{closest:()=>({dataset:{action:'temp-preview'}})}});
 assert.match(again.element('view').innerHTML,/Duplikaty/);
 assert.equal(again.run('tempPreview.added'),0);
});

test('temperature history is optional for old backups, validated on new writes, and removable by day',()=>{
 const b=boot();const click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 assert.equal(b.run('{const p=seed();delete p.temperatureHistory;DataStore.validate(p).temperatureHistory.length}'),0);
 assert.throws(()=>b.run("{const p=seed();p.temperatureHistory.push({room:'other',at:'2024-11-15T10:00:00.000Z',temp:23});DataStore.validate(p)}"));
 assert.throws(()=>b.run("{const p=seed();p.temperatureHistory.push({room:'salon',at:'2024-11-15T10:00:00.000Z',temp:23},{room:'salon',at:'2024-11-15T10:00:00.000Z',temp:23});DataStore.validate(p)}"));
 b.run("state.temperatureHistory.push({room:'salon',at:'2024-11-15T10:00:00.000Z',temp:23});save();setPage('temperatures')");
 click('temp-delete-day',{day:'2024-11-15'});
 assert.equal(b.run('state.temperatureHistory.length'),0);
});


test('See–Judge–Act: manually reviewed decision is local, editable, deletable and persists in JSON',()=>{
 const b=boot(),click=(action,extra={})=>b.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 b.run("setPage('review')");
 assert.match(b.element('view').innerHTML,/Widzieć/);
 assert.match(b.element('view').innerHTML,/Pobierz raport dla ChatGPT/);
 b.element('reviewChoice').value='observe';
 b.element('reviewAssessment').value='Stabilność temperatury dobra, ale za mało danych o gazie.';
 b.element('reviewAction').value='Pozostawić ENGO 22°C i kocioł 55°C.';
 b.element('reviewOn').value='2026-11-23';
 b.element('reviewExperiment').value='';
 click('review-save');
 assert.equal(b.run('state.decisionLog.length'),1);
 assert.equal(b.run('state.decisionLog[0].settings.engo'),22);
 assert.equal(b.run('state.decisionLog[0].choice'),'observe');
 assert.equal(b.run('state.decisionLog[0].reviewOn'),'2026-11-23');
 assert.equal(b.run('state.engoCycles.length'),0);
 const c=boot(Object.fromEntries(b.data)),again=(action,extra={})=>c.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 assert.equal(c.run('state.decisionLog.length'),1);
 c.run("setPage('review')");
 const id=c.run('state.decisionLog[0].id');
 again('review-edit',{id});
 assert.match(c.element('view').innerHTML,/Stabilność temperatury dobra/);
 c.element('reviewChoice').value='keep';
 c.element('reviewAssessment').value='<img src=x onerror=alert(1)> pozostawić bez zmian';
 c.element('reviewAction').value='Nie zmieniać nastaw.';
 c.element('reviewOn').value='';
 c.element('reviewExperiment').value='';
 again('review-save');
 assert.equal(c.run('state.decisionLog.length'),1);
 assert.equal(c.run('state.decisionLog[0].choice'),'keep');
 assert.match(c.element('view').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(c.element('view').innerHTML,/<img src=x onerror/);
 again('review-delete',{id});
 assert.equal(c.run('state.decisionLog.length'),0);
});

test('See–Judge–Act: old state migrates to empty decision log; invalid decisions rejected',()=>{
 const b=boot();
 assert.equal(b.run('{const p=seed();delete p.decisionLog;DataStore.validate(p).decisionLog.length}'),0);
 assert.throws(()=>b.run("{const p=seed();p.decisionLog.push({id:'x',at:now(),choice:'auto-control'});DataStore.validate(p)}"));
 assert.throws(()=>b.run("{const p=seed();p.decisionLog.push({id:'x',at:now(),periodStart:now(),periodEnd:now(),periodKey:'week',choice:'keep',assessment:'',action:'',reviewOn:null,experimentId:null,settings:{boiler:55,engo:22}});DataStore.validate(p)}"));
});

test('See–Judge–Act: report download is explicit, private and does not mutate data',()=>{
 const b=boot();
 b.run("state.privateMap='data:image/png;base64,QUJD';state.events.push({id:'private',at:now(),label:'private',detail:'PERSONAL_DIARY_SECRET'});save()");
 const before=b.data.get(KEY);
 b.run("downloadText=(filename,body,mime)=>{globalThis.savedReport={filename,body,mime}};exportAnalysisReport()");
 assert.equal(b.data.get(KEY),before);
 const file=JSON.parse(b.run('savedReport.body'));
 assert.equal(file.format,'moje-ogrzewanie-analiza');
 assert.ok(b.run('savedReport.filename').endsWith('.json'));
 assert.equal(file.period.hours,168);
 assert.ok(!JSON.stringify(file).includes('PERSONAL_DIARY_SECRET'));
 assert.ok(!JSON.stringify(file).includes('QUJD'));
});


test('v1.8: legacy v1.7 backup safely gains empty optional project memory without wiping readings',()=>{
 const b=boot();
 const parsed=b.run('{const p=seed();delete p.projectMemory;delete p.knowledgeLog;p.rooms.bedroom.readings.push({at:now(),temp:21.6,humidity:42,note:"existing"});DataStore.validate(p)}');
 assert.equal(parsed.projectMemory.currentQuestion,'');
 assert.equal(parsed.knowledgeLog.length,0);
 assert.equal(parsed.rooms.bedroom.readings.length,1);
});

test('v1.8: project card is saved privately and survives app restart',()=>{
 const b=boot(),click=(ac,ex={})=>b.listeners.click({target:{closest:()=>({dataset:{action:ac,...ex}})}});
 b.run("setPage('memory')");
 assert.match(b.element('view').innerHTML,/Pamięć i optymalizacja/);
 b.element('memory-overview').value='Nad pokojami jest strych (prywatne).';
 b.element('memory-installation').value='Kocioł gazowy i grzejniki.';
 b.element('memory-sensors').value='ENGO niezależny od Setti+.';
 b.element('memory-comfort').value='Komfort jest ważniejszy niż pozorne oszczędności.';
 b.element('memory-constraints').value='Czasem pracuje grzejnik elektryczny.';
 b.element('memory-currentQuestion').value='Czy 50°C wystarczy bez niedogrzania?';
 click('memory-card-save');
 assert.equal(b.run('state.projectMemory.currentQuestion'),'Czy 50°C wystarczy bez niedogrzania?');
 assert.equal(b.run('state.projectMemory.overview'),'Nad pokojami jest strych (prywatne).');
 const c=boot(Object.fromEntries(b.data));
 assert.equal(c.run('state.projectMemory.sensors'),'ENGO niezależny od Setti+.');
 c.run("setPage('memory')");
 assert.match(c.element('view').innerHTML,/Nad pokojami jest strych/);
});

test('v1.8: manual knowledge is append-only and superseding preserves negative results',()=>{
 const b=boot(),click=(ac,ex={})=>b.listeners.click({target:{closest:()=>({dataset:{action:ac,...ex}})}});
 b.run("setPage('memory')");
 b.element('memoryKind').value='result';
 b.element('memoryConfidence').value='medium';
 b.element('memoryOutcome').value='negative';
 b.element('memoryExperiment').value='none';
 b.element('memoryTitle').value='Zimniejsza nastawa nie działa';
 b.element('memoryConclusion').value='W testowej próbie pojawiło się niedogrzanie.';
 b.element('memoryEvidence').value='Syntetyczny test nr 2.';
 b.element('memoryConditions').value='Gdy temperatura zewnętrzna jest ujemna.';
 click('memory-add');
 assert.equal(b.run('state.knowledgeLog.length'),1);
 assert.equal(b.run('state.knowledgeLog[0].outcome'),'negative');
 assert.match(b.element('view').innerHTML,/Niekorzystny/);
 const id=b.run('state.knowledgeLog[0].id');
 click('memory-supersede',{id});
 assert.equal(b.run('state.knowledgeLog[0].status'),'superseded');
 assert.equal(b.run('state.knowledgeLog.length'),1);
 const c=boot(Object.fromEntries(b.data));
 assert.equal(c.run('state.knowledgeLog[0].status'),'superseded');
});

test('v1.8: ChatGPT proposal import previews, protects against duplicates and requires confirmation',()=>{
 const b=boot(),click=(ac,ex={})=>b.listeners.click({target:{closest:()=>({dataset:{action:ac,...ex}})}});
 b.run("setPage('memory')");
 const obj={format:'moje-ogrzewanie-propozycje-wiedzy',version:1,items:[
   {kind:'observation',title:'Stabilność sypialni',conclusion:'Pomiar 21,4–21,8°C.',evidence:'Testowe dane.',conditions:'Jedna doba.',
     confidence:'medium',outcome:'none',experimentId:null}
 ]};
 b.element('memoryBulk').value=JSON.stringify(obj);
 click('memory-preview');
 assert.equal(b.run('memoryPreview.items.length'),1);
 assert.equal(b.run('state.knowledgeLog.length'),0);
 b.setConfirm(false);click('memory-confirm');
 assert.equal(b.run('state.knowledgeLog.length'),0,'declined import leaves state unchanged');
 b.setConfirm(true);click('memory-confirm');
 assert.equal(b.run('state.knowledgeLog.length'),1);
 assert.equal(b.run('state.knowledgeLog[0].source'),'chatgpt-reviewed');
 b.element('memoryBulk').value=JSON.stringify(obj);
 click('memory-preview');
 assert.equal(b.run('memoryPreview.items.length'),0);
 assert.equal(b.run('memoryPreview.duplicates'),1);
 click('memory-confirm');
 assert.equal(b.run('state.knowledgeLog.length'),1);
});

test('v1.8: report includes complete prior memory and experiments outside selected measurement window',()=>{
 const b=boot();
 b.run("state.projectMemory.overview='PRIV_CONTEXT_FOR_CHATGPT';state.projectMemory.currentQuestion='My open question';"+
    "state.knowledgeLog.push(MemoryKit.createRecord({kind:'result',title:'Old negative test',conclusion:'Failed.',evidence:'Old test.',"+
    "conditions:'Cold day',confidence:'high',outcome:'negative',experimentId:null},'manual','2024-01-10T12:00:00Z'));"+
    "state.decisionLog.push({id:'old',at:'2024-01-10T12:00:00Z',periodStart:'2024-01-09T12:00:00Z',"+
    "periodEnd:'2024-01-10T12:00:00Z',periodKey:'day',choice:'keep',assessment:'Previous decision.',"+
    "action:'Keep boiler.',reviewOn:null,experimentId:null,settings:{boiler:55,engo:22}});"+
    "state.privateMap='data:image/png;base64,QUJD';state.events.push({id:'private',at:now(),label:'secret',detail:'NEVER_COPY_RAW_EVENTS'});save()");
 const before=b.data.get(KEY);
 b.run("downloadText=(filename,body,mime)=>{globalThis.savedReport={filename,body,mime}};exportAnalysisReport()");
 assert.equal(b.data.get(KEY),before);
 const report=JSON.parse(b.run('savedReport.body'));
 assert.equal(report.format_version,2);
 assert.equal(report.memory_context.durable_project_card.overview,'PRIV_CONTEXT_FOR_CHATGPT');
 assert.equal(report.memory_context.entire_knowledge_history[0].outcome,'negative');
 assert.equal(report.memory_context.complete_decision_history[0].assessment,'Previous decision.');
 assert.equal(report.memory_context.open_problem,'My open question');
 assert.ok(b.run('savedReport.filename').includes('pamiec-i-analiza'));
 assert.ok(!JSON.stringify(report).includes('NEVER_COPY_RAW_EVENTS'));
 assert.ok(!JSON.stringify(report).includes('QUJD'));
});

test('v1.8: reject corrupt memory and knowledge instead of accepting unsafe backup',()=>{
 const b=boot();
 for(const change of [
  "p.projectMemory.overview=42",
  "p.projectMemory.currentQuestion='a'.repeat(1501)",
  "p.projectMemory.updatedAt='bad'",
  "p.knowledgeLog=[{id:'bad',at:now(),kind:'auto-control'}]",
  "p.knowledgeLog=[MemoryKit.createRecord({kind:'result',title:'x',conclusion:'x',evidence:'x',conditions:'',confidence:'low',outcome:'negative',experimentId:null})];p.knowledgeLog.push(p.knowledgeLog[0])"
 ]){
  assert.throws(()=>b.run('{const p=seed();'+change+';DataStore.validate(p)}'),change);
 }
});


test('v1.8.1: governing principle is visible on the first screen, with all four virtues on mobile-friendly memory page',()=>{
 const b=boot();
 b.run("setPage('home')");
 assert.match(b.element('view').innerHTML,/Dobrze gospodarować powierzonym mi dobrem/);
 assert.match(b.element('view').innerHTML,/data-page="memory"/);
 b.run("setPage('memory')");
 const output=b.element('view').innerHTML;
 for(const name of ['Roztropność','Sprawiedliwość','Umiarkowanie','Męstwo'])
   assert.ok(output.includes(name),name);
 assert.match(output,/Zasada naczelna/);
 assert.match(output,/Jakie dobro chcemy osiągnąć/);
 assert.match(output,/ORLENOWI/);
 assert.match(output,/Trwała karta projektu/);
 assert.match(output,/Rejestr zdobytej wiedzy/);
 assert.match(output,/Moje Ogrzewanie v1.8.2/);
});

test('v1.8.1: ethics is in exported report without changing existing five knowledge records',()=>{
 const b=boot();
 b.run("state.projectMemory.overview='Already stored private text';" +
    "for(let i=0;i<5;i++)state.knowledgeLog.push(MemoryKit.createRecord({kind:'observation',"+
    "title:'Dawny wniosek '+i,conclusion:'Zachowany pomiar '+i,evidence:'History',conditions:'',"+
    "confidence:'low',outcome:'none',experimentId:null}));save()");
 const before=b.data.get(KEY);
 b.run("downloadText=(name,body)=>{globalThis.ethicsExport=JSON.parse(body)};exportAnalysisReport()");
 assert.equal(b.data.get(KEY),before);
 const report=JSON.parse(b.run('JSON.stringify(ethicsExport)'));
 assert.equal(report.memory_context.entire_knowledge_history.length,5);
 assert.match(report.memory_context.supreme_principle.principle,/powierzonym mi dobrem/);
 assert.equal(report.memory_context.supreme_principle.virtues.length,4);
 assert.equal(report.memory_context.durable_project_card.overview,'Already stored private text');
 const c=boot(Object.fromEntries(b.data));
 assert.equal(c.run('state.knowledgeLog.length'),5);
 assert.equal(c.run('state.projectMemory.overview'),'Already stored private text');
});
