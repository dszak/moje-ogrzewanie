const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('public/storage.js','utf8')+'\n'+fs.readFileSync('public/insights.js','utf8')+'\n'+fs.readFileSync('public/app.js','utf8');
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
 for(const page of ['home','insights','experiments','history','map','settings'])b.run(`setPage('${page}')`);
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
