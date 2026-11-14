'use strict';
// Keep this key and schema stable across releases. UI versions are independent.
const DataStore = (() => {
  const KEY='moje-ogrzewanie-data-v1', BACKUP=KEY+'-previous';
  const roomIds=['bedroom','salon','kitchen','bigbath','smallbath','hall'];
  const radIds=Array.from({length:8},(_,i)=>'G'+(i+1));
  const doorIds=['bed-hall','kitchen-hall','salon-kitchen','bigbath-hall','smallbath-hall','entrance-hall'];
  let baseline=null, locked=false, warning='';
  const fail=()=>{throw Error('Nieprawidłowa lub nieobsługiwana kopia danych. Oryginał nie został zmieniony.')};
  function obj(v){if(!v||typeof v!=='object'||Array.isArray(v))fail();return v}
  function arr(v){if(!Array.isArray(v))fail();return v}
  function str(v,max=10000){if(typeof v!=='string'||v.length>max)fail()}
  function number(v,min,max,nullable=true){if(v===null&&nullable)return;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail()}
  function date(v){str(v,60);if(!Number.isFinite(Date.parse(v)))fail()}
  function radiators(v){obj(v);radIds.forEach(k=>number(v[k],5,35))}
  function doors(v){obj(v);doorIds.forEach(k=>{if(!['unknown','open','ajar','closed'].includes(v[k]))fail()})}
  function snapshot(v){obj(v);number(v.boiler,25,85,false);number(v.engo,10,30,false);str(v.engoPlace,220);radiators(v.radiators);doors(v.doors);obj(v.targets);obj(v.measurements);roomIds.forEach(k=>{number(v.targets[k],10,30);number(v.measurements[k],-10,45)})}
  function validate(input){
    const p=JSON.parse(JSON.stringify(input));obj(p);if(p.version!==1)fail();
    const g=obj(p.global);number(g.boiler,25,85,false);number(g.engo,10,30,false);number(g.engoCurrent,0,45);str(g.engoPlace,220);if(![null,'on','off'].includes(g.electric))fail();
    obj(p.rooms);roomIds.forEach(k=>{const r=obj(p.rooms[k]);number(r.target,10,30);arr(r.readings).forEach(m=>{obj(m);date(m.at);number(m.temp,-10,45,false);number(m.humidity,0,100);str(m.note,200)})});
    radiators(p.radiators);doors(p.doors);
    arr(p.events).forEach(e=>{obj(e);str(e.id,100);date(e.at);str(e.label,300);str(e.detail,10000)});
    let active=0;arr(p.experiments).forEach(e=>{obj(e);str(e.id,100);str(e.title,100);str(e.description,1500);date(e.started);snapshot(e.start);if(e.status==='active'){active++}else if(e.status==='done'){date(e.ended);snapshot(e.end);str(e.notes,3000)}else fail()});if(active>1)fail();
    // Early v1 files may not have observations yet; never replace existing arrays.
    if(p.conditions===undefined)p.conditions=[];
    arr(p.conditions).forEach(c=>{obj(c);date(c.at);number(c.outdoor,-45,50);number(c.gas,0,100000000);if(!['unknown','sun','clouds','mixed'].includes(c.sky))fail()});
    if(p.gasHistory===undefined)p.gasHistory=[];
    arr(p.gasHistory).forEach(r=>{obj(r);str(r.id,100);date(r.at);number(r.gas,0,100000000,false);if(!['old','new'].includes(r.meter))fail();if(!['orlen','manual'].includes(r.source))fail()});
    if(p.heatingEvents===undefined)p.heatingEvents=[];
    arr(p.heatingEvents).forEach(e=>{obj(e);str(e.id,100);date(e.at);number(e.engo,10,30,false);str(e.note,300)});
    if(p.weather===undefined)p.weather={hourly:[],updated:null};
    obj(p.weather);if(p.weather.updated!==null)date(p.weather.updated);
    arr(p.weather.hourly);if(p.weather.hourly.length>30000)fail();
    p.weather.hourly.forEach(h=>{obj(h);number(h.at,1400000000,2500000000,false);number(h.temp,-45,50,false)});
    if(p.privateMap!==undefined&&p.privateMap!==null){str(p.privateMap,3*1024*1024);if(!/^data:image\/(?:png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(p.privateMap))fail()}
    return p;
  }
  function load(seed){
    try{
      baseline=localStorage.getItem(KEY);
      if(baseline!==null)return validate(JSON.parse(baseline));
      // Migrate a single validated original v1 record on the SAME browser origin.
      const legacy=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k!==KEY&&/^moje-ogrzewanie-.*-v1$/.test(k))legacy.push(k)}
      if(legacy.length>1)throw Error('Znaleziono kilka starszych zapisów. Wczytaj wybraną kopię JSON.');
      if(legacy.length===1){const p=validate(JSON.parse(localStorage.getItem(legacy[0])));const raw=JSON.stringify(p);localStorage.setItem(KEY,raw);baseline=raw;return p}
      return seed();
    }catch(e){locked=true;warning='Nie można odczytać danych. Niczego nie nadpisano. W Ustawieniach przywróć poprzedni zapis lub wczytaj kopię JSON.';return seed()}
  }
  function save(value,replace=false){
    const p=validate(value),raw=JSON.stringify(p);
    try{
      const old=localStorage.getItem(KEY);
      if(!replace&&(locked||old!==baseline))throw Error('Zapis zablokowany: dane zmieniła inna karta lub są nieczytelne. Odśwież aplikację albo wczytaj kopię JSON.');
      // Write main record atomically first; a full recovery slot must not block a save.
      localStorage.setItem(KEY,raw);baseline=raw;locked=false;warning='';
      if(old&&old!==raw){try{validate(JSON.parse(old));localStorage.setItem(BACKUP,old)}catch(e){warning='Zapisano dane, ale nie udało się uaktualnić lokalnej kopii odzyskiwania. Pobierz JSON.'}}
    }catch(e){if(e.message.startsWith('Zapis zablokowany'))throw e;throw Error('Nie zapisano zmiany: brak miejsca lub dostępu do pamięci. Poprzedni zapis zachowano. Pobierz kopię JSON.')}
    return p;
  }
  function current(seed){try{return baseline?validate(JSON.parse(baseline)):seed()}catch(e){return seed()}}
  function recover(){const raw=localStorage.getItem(BACKUP);if(!raw)throw Error('Brak poprzedniego zapisu. Wczytaj kopię JSON.');const p=validate(JSON.parse(raw));save(p,true);return p}
  return {load,save,validate,current,recover,replace:p=>save(p,true),isKey:k=>k===KEY,get warning(){return warning}};
})();
