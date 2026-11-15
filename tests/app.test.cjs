const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('public/storage.js','utf8')+'\n'+fs.readFileSync('public/insights.js','utf8')+'\n'+fs.readFileSync('public/setti.js','utf8')+'\n'+fs.readFileSync('public/heads.js','utf8')+'\n'+fs.readFileSync('public/app.js','utf8');
function boot(initial={}){
 const data=new Map(Object.entries(initial)),elements=new Map(),listeners={};
 let quota=false;
 const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem(k,v){if(quota)throw Error('quota');data.set(k,v)}};
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',hidden:true,style:{},addEventListener(){},focus(){}});return elements.get(id)};
 const ctx=vm.createContext({localStorage:storage,document:{getElementById:element,addEventListener:(n,f)=>listeners[n]=f,createElement:()=>({style:{}}),body:{appendChild(){}}},navigator:{},window:{addEventListener(){}},location:{protocol:'https:'},setTimeout:()=>0,clearTimeout(){},scrollTo(){},confirm:()=>true,alert(){},console,Blob,URL});
 vm.runInContext(source,ctx);
 return {run:s=>vm.runInContext(s,ctx),data,elements,listeners,element,setQuota:v=>quota=v};
}
const KEY='moje-ogrzewanie-data-v1';
test('six rooms, eight heads, doors, all screens render',()=>{
 const b=boot();assert.equal(b.run('ROOMS.length'),6);assert.equal(b.run('Object.keys(RADS).length'),8);
 for(const page of ['home','heads','insights','experiments','history','map','settings'])b.run(`setPage('${page}')`);
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
  assert.match(view,/Osiem głowic TRV001/);
  assert.equal((view.match(/class="head-reading"/g)||[]).length,8);
  assert.match(view,/Tryb \(surowy\):/);
  assert.match(view,/21,1°C/);
  assert.match(view,/Odśwież z GitHub/);
  assert.equal(b.data.get(KEY),before);
  assert.equal(b.run('state.events.length'),0);
});
