'use strict';

const ROOMS=[
 {id:'bedroom',name:'Sypialnia',icon:'🛏️',sensor:'T1',rads:['G7','G8'],doors:['bed-hall'],desc:'Pokój referencyjny — ENGO decyduje o zapotrzebowaniu na ciepło.'},
 {id:'salon',name:'Salon',icon:'🛋️',sensor:'T2',rads:['G5','G6'],doors:['salon-kitchen'],desc:'Salon połączony drzwiami z kuchnią; dwa grzejniki panelowe.'},
 {id:'kitchen',name:'Kuchnia',icon:'🍳',sensor:'T3',rads:['G3','G4'],doors:['kitchen-hall','salon-kitchen'],desc:'Tutaj znajduje się kocioł BRÖTJE, który ogrzewa cały lokal.'},
 {id:'bigbath',name:'Duża łazienka',icon:'🛁',sensor:'T4',rads:['G2'],doors:['bigbath-hall'],desc:'Jeden grzejnik wodny; czujnik T4.'},
 {id:'smallbath',name:'Mała łazienka',icon:'🚿',sensor:'T5',rads:['G1'],doors:['smallbath-hall'],desc:'Grzejnik wodny i dodatkowy konwektor elektryczny GE1.'},
 {id:'hall',name:'Przedpokój',icon:'🚪',sensor:'T6',rads:[],doors:['bed-hall','kitchen-hall','bigbath-hall','smallbath-hall','entrance-hall'],desc:'Bez grzejnika. Temperatura zależy m.in. od sąsiednich pomieszczeń, drzwi i wentylacji.'}
];
const RADS={G1:'Głowica · mała łazienka',G2:'Głowica · duża łazienka',G3:'Głowica G3 · kuchnia',G4:'Głowica G4 · kuchnia',G5:'Głowica G5 · salon',G6:'Głowica G6 · salon',G7:'Głowica G7 · sypialnia',G8:'Głowica G8 · sypialnia'};
const DOORS={
 'bed-hall':{name:'Sypialnia ↔ przedpokój',rooms:['bedroom','hall']},
 'kitchen-hall':{name:'Kuchnia ↔ przedpokój',rooms:['kitchen','hall']},
 'salon-kitchen':{name:'Salon ↔ kuchnia',rooms:['salon','kitchen']},
 'bigbath-hall':{name:'Duża łazienka ↔ przedpokój',rooms:['bigbath','hall']},
 'smallbath-hall':{name:'Mała łazienka ↔ przedpokój',rooms:['smallbath','hall']},
 'entrance-hall':{name:'Drzwi wejściowe ↔ przedpokój',rooms:['hall']}
};
const DOORSTATUS={unknown:'Nie ustalono',open:'Otwarte',ajar:'Uchylone',closed:'Zamknięte'};
const RM=Object.fromEntries(ROOMS.map(x=>[x.id,x]));
const seed=()=>({version:1,global:{boiler:55,engo:22,engoCurrent:null,engoPlace:'',electric:null},rooms:Object.fromEntries(ROOMS.map(r=>[r.id,{target:r.id==='bedroom'?22:null,readings:[]}])),radiators:Object.fromEntries(Object.keys(RADS).map(k=>[k,null])),doors:Object.fromEntries(Object.keys(DOORS).map(k=>[k,'unknown'])),events:[],experiments:[],conditions:[],gasHistory:[],heatingEvents:[],engoCycles:[],temperatureHistory:[],decisionLog:[],projectMemory:MemoryKit.EMPTY_CARD(),knowledgeLog:[],boilerReadings:[],weather:{hourly:[],updated:null}});
let reviewPeriod='week';let editingDecision=null;let memoryPreview=null;let memoryImportDraft='';let tempDay=null;let tempPreview=null;let tempImportDraft='';let tempVisible=new Set(['bedroom','salon','kitchen','bigbath','smallbath','hall']);let historyLimit=120;let engoLimit=120;let editingGas=null;let editingBoiler=null;let editingEngo=null;let engoImportDraft='';let pendingEngo=null;let state=load();let page='home';let currentRoom='bedroom';let filterRoom='all';let toastTimer;
let boardMessage='', lastGasId=null, haSnapshot=null, airChoice=new Set(),airOpening='',airEdit=null;
let coSending=false,coStatus='',gasQueued=false,gasSending=false;
let haUnlocked=false,haSyncLabel='Nie połączono jeszcze prywatnej historii HA.';
function load(){return DataStore.load(seed)}
function save(){state=DataStore.save(state);const el=document.getElementById('storageAlert');el.hidden=!DataStore.warning;if(DataStore.warning)el.textContent=DataStore.warning}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(x,prec=1){return x===null||x===undefined||x===''?'—':Number(x).toFixed(prec).replace('.',',')}
function T(x){return x===null||x===undefined?'—':`${fmt(x)}°C`}
function now(){return new Date().toISOString()}
function day(s){return s?HeatingBoard.when(s):'—'}
function last(rid){return(state.rooms[rid]?.readings||[]).slice(-1)[0]||null}
function latestReading(rid){return Setti.room(rid)||Setti.lastRoom(rid)||last(rid)}
function delta(rid){const p=Setti.room(rid)||(!Setti.lastRoom(rid)?last(rid):null),g=state.rooms[rid].target;return p&&g!==null?Math.round((p.temp-g)*10)/10:null}
function stat(rid){if(!Setti.room(rid)&&Setti.lastRoom(rid))return ['Dane nieaktualne','cold'];let d=delta(rid);return d===null?['Brak porównania','']:d<-.4?['Poniżej celu','cold']:d>.5?['Powyżej celu','hot']:['Blisko celu','ok']}
function changeLog(label,detail){state.events.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,6),at:now(),label,detail});}
function toast(msg){let p=document.getElementById('toast');if(!p){p=document.createElement('div');p.id='toast';p.style='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#103f39;color:white;padding:12px 18px;border-radius:12px;box-shadow:0 12px 25px #0003;z-index:99;font-size:13px;max-width:92%;text-align:center';document.body.appendChild(p)}p.textContent=msg;p.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>p.style.display='none',3600)}
function setPage(p,r){
 page=p;if(r)currentRoom=r;render();scrollTo({top:0,behavior:'instant'});
 const heading=document.getElementById('view').querySelector?.('h2');
 if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
}
function renderNav(){
 const tabs=[['home','Start'],['rooms','Pomieszczenia'],['analysis','Analizy'],['more','Więcej']];
 const sections={home:['home','dashboard','gas-quick','co-quick','boiler-quick','air'],rooms:['rooms','room','heads'],
  analysis:['analysis','insights','engo-cycles','temperatures','review','experiments','history']};
 const current=Object.keys(sections).find(key=>sections[key].includes(page))||'more';
 document.getElementById('nav').innerHTML=tabs.map(([id,title])=>
  `<button data-action="page" data-page="${id}" class="${current===id?'active':''}" ${current===id?'aria-current="page"':''}>${title}</button>`).join('');
}
function sec(title,desc,extra=''){return `<div class="section-head"><div><h2>${title}</h2><p>${desc||''}</p></div>${extra}</div>`}
function settiBanner(){const st=Setti.status();return `<div class="banner ${st.ok?'info':'warn'}"><span>🌡️</span><span><b>Setti+: ${esc(st.label)}</b>${st.at?' · synchronizacja '+day(st.at):''}. Dane tylko do odczytu; brak aktualizacji nie blokuje ręcznego zapisu. <button class="text-link" data-action="refresh-setti">Odśwież pomiary</button></span></div>`}

function renderHeads(){
 const snap=Heads.lastSnapshot(),hs=Heads.status(),ss=Setti.status();
 const engo=`<section class="card" style="margin-bottom:16px"><div class="group-heading"><h3>ENGO Smart · sypialnia</h3><span class="pill">wpis ręczny</span></div><div class="panel-readings"><div><span>Temperatura odnotowana ENGO</span><strong>${T(state.global.engoCurrent)}</strong></div><div><span>Nastawa termostatu</span><strong>${T(state.global.engo)}</strong></div><div><span>Nastawa kotła BRÖTJE</span><strong>${T(state.global.boiler)}</strong></div></div><p class="hint">Wartości z dziennika, nie z bieżącej integracji ENGO ani kotła. Zmienisz je w Ustawieniach.</p></section>`;
 const rooms=ROOMS.map(r=>{
  const sensor=Setti.room(r.id),stale=!sensor?Setti.lastRoom(r.id):null,fallback=last(r.id),actual=sensor||stale||fallback;
  return `<section class="card" style="margin-bottom:12px"><div class="group-heading"><h3>${r.icon} ${esc(r.name)}</h3><span class="pill">${r.sensor} · ${sensor?'Setti+ aktualny':stale?'Setti+ · nieaktualne':fallback?'ostatni wpis ręczny':'brak pomiaru'}</span></div>
  ${stale?'<p class="hint">Ostatni automatyczny pomiar: '+day(stale.at)+' · nie używaj jako bieżącej temperatury.</p>':''}
  <div class="panel-readings"><div><span>Temperatura pokojowa</span><strong>${actual?T(actual.temp):'—'}</strong></div><div><span>Wilgotność</span><strong>${actual&&typeof actual.humidity==='number'?fmt(actual.humidity,0)+'%':'—'}</strong></div><div><span>Twój cel</span><strong>${T(state.rooms[r.id].target)}</strong></div></div>
  ${r.rads.length?`<div class="panel-heads">${r.rads.map(id=>{
   const h=snap?.heads[id.toLowerCase()];
   return `<div class="panel-head"><b>${id}</b><span>Przy głowicy: <strong>${h?T(h.temperature):'—'}</strong></span><span>Nastawa: <strong>${h?T(h.target_temperature):'—'}</strong></span>${h?`<small>Kalibracja: ${fmt(h.calibration)}°C · Tryb: ${esc(h.mode_raw)} ${hs.ok?'':'· dane nieaktualne'}</small>`:'<small>Brak odczytu z GitHub</small>'}</div>`;
  }).join('')}</div>`:'<p class="hint">Przedpokój nie ma grzejnika.</p>'}</section>`;
 }).join('');
 return `${sec('Panel ogrzewania','Sześć pomieszczeń: temperatura, wilgotność, zadane wartości i osiem głowic. Bez wykresów i bez sterowania urządzeniami.')}
 <div class="banner ${hs.ok&&ss.ok?'info':'warn'}"><span>🌡️</span><span><b>Czujniki: ${esc(ss.label)}</b> · Głowice: ${esc(hs.label)}. <button class="text-link" data-action="refresh-setti">Odśwież czujniki</button> · <button class="text-link" data-action="refresh-heads">Odśwież głowice</button></span></div>${engo}${rooms}
 <p class="hint">Pomiary czujników i głowic pobierane są tylko do odczytu z GitHub. Po 20 minutach od synchronizacji traktujemy je jako nieaktualne. Temperatura przy głowicy nie jest temperaturą całego pokoju. Dane ENGO i kotła pozostają ręczne.</p>`;
}
function renderGasSetti(s){if(!s)return '—';return `<details><summary>6 pomiarów</summary><div class="hint">Synchronizacja: ${day(s.last_sync)} (niekoniecznie czas fizycznego pomiaru)</div><ul>${ROOMS.map(r=>`<li>${esc(r.name)}: ${T(s.rooms[r.id].temperature)} · ${fmt(s.rooms[r.id].humidity,0)}%</li>`).join('')}</ul></details>`}
function renderGasHistoryCard(r){
 const meter=r.meter==='old'?'Stary gazomierz':'Nowy gazomierz';
 const source=r.source==='manual'?'Odczyt ręczny':r.source==='orlen'?'ORLEN':'Wcześniejsza obserwacja';
 const snap=r.setti;
 return `<article class="gas-history-entry">
  <div class="gas-history-entry-header"><strong>${day(new Date(r.at).toISOString())}</strong><span class="pill">${meter}</span></div>
  <div class="gas-history-entry-value">${fmt(r.gas,3)} <span>m³</span></div>
  <div class="gas-history-entry-source">Źródło: ${source}</div>
  ${gasActions(r)}
  ${snap?`<details class="gas-history-entry-setti">
    <summary>6 pomiarów Setti+</summary>
    <p class="gas-history-entry-sync">Synchronizacja: ${day(snap.last_sync)} · czas przesłania danych</p>
    <div class="gas-history-entry-rooms">${ROOMS.map(room=>`<div class="gas-history-entry-room">
      <span>${esc(room.name)}</span>
      <strong>${T(snap.rooms[room.id].temperature)} <small>· ${fmt(snap.rooms[room.id].humidity,0)}%</small></strong>
    </div>`).join('')}</div>
  </details>`:'<div class="gas-history-entry-empty">Brak dołączonych pomiarów Setti+.</div>'}
 </article>`;
}
function gasActions(r){if(r.kind==='history'&&r.index>=state.gasHistory.length)return '<span class="small muted">Archiwum prywatne · tylko odczyt</span>';return `<div class="gas-actions"><button class="action ghost" data-action="edit-gas" data-kind="${r.kind}" data-index="${r.index}">Edytuj</button><button class="action danger" data-action="delete-gas" data-kind="${r.kind}" data-index="${r.index}">Usuń</button></div>`}
function gasEditor(){
 if(!editingGas)return '';
 const r=(editingGas.kind==='condition'?state.conditions:state.gasHistory)[editingGas.index];
 if(!r)return '';
 const limited=editingGas.kind==='condition';
 return `<section class="card gas-edit" style="margin-bottom:16px"><h3>Popraw odczyt gazomierza</h3><p class="hint">Poprawki zostaną odnotowane w historii zmian. ${limited?'Dla odczytu połączonego z obserwacją pogody można poprawić tylko stan licznika, aby nie zmienić daty tej obserwacji.':'Oryginalna migawka Setti+, jeśli była dołączona, pozostaje zachowana.'}</p>
  <div class="form-grid">
  <div class="wide"><label for="editGasAt">Data i godzina</label><input id="editGasAt" type="datetime-local" value="${dateLocal(Date.parse(r.at))}" ${limited?'disabled':''}></div>
  <div><label for="editGasMeter">Gazomierz</label><select id="editGasMeter" ${limited?'disabled':''}><option value="new" ${r.meter!=='old'?'selected':''}>Nowy</option><option value="old" ${r.meter==='old'?'selected':''}>Stary</option></select></div>
  <div><label for="editGasSource">Źródło</label><select id="editGasSource" ${limited?'disabled':''}><option value="manual" ${r.source==='manual'?'selected':''}>Mój odczyt</option><option value="orlen" ${r.source==='orlen'?'selected':''}>ORLEN</option></select></div>
  <div class="wide"><label for="editGasValue">Poprawny stan (m³)</label><input id="editGasValue" type="number" inputmode="decimal" min="0" max="100000000" step="0.001" value="${r.gas}"></div></div>
  <div class="actions" style="margin-top:12px"><button class="action" data-action="save-gas-edit">Zapisz poprawkę</button><button class="action ghost" data-action="cancel-gas-edit">Anuluj</button></div></section>`;
}
function roomCard(r){let live=Setti.room(r.id),stale=!live?Setti.lastRoom(r.id):null,rec=live||stale||last(r.id),status=stat(r.id);return `<button class="room-card" data-action="open-room" data-room="${r.id}" aria-label="Otwórz: ${r.name}"><div class="room-top"><span class="room-icon">${r.icon}</span><span class="pill ${status[1]}">${status[0]}</span></div><div class="room-name">${r.name}</div><div class="room-sub">${r.sensor} Setti+ · ${r.rads.length?`${r.rads.length} grzejnik${r.rads.length===1?'':'i'}`:'bez grzejnika'}</div><div class="room-temps"><div><div class="reading">${rec?T(rec.temp):'—'}</div><div class="reading-label">${live?'Setti+ automatycznie':stale?'Setti+ · nieaktualne':'zapis ręczny'}</div></div><div><div class="reading" style="color:#426b5e;font-size:24px">${T(state.rooms[r.id].target)}</div><div class="reading-label">Twój cel</div></div></div><div class="room-foot"><span>${rec?(live?'Synchronizacja: ':stale?'Nieaktualny pomiar z ':'Ręcznie: ')+day(rec.at):'Jeszcze nie wpisano odczytu'}</span><span style="color:var(--teal);font-weight:800">Otwórz →</span></div></button>`}
function renderHomeLegacy(){let n=ROOMS.filter(r=>latestReading(r.id)).length, active=state.experiments.find(e=>e.status==='active');
return `${sec('Twoje mieszkanie','Wybierz pomieszczenie, sprawdź pomiary i ustaw cele.')}${settiBanner()}<section class="card moral-home" aria-label="Zasada naczelna projektu"><p class="moral-home-label">Zasada naczelna</p><strong>${esc(MemoryKit.ETHICS.principle)}</strong><p>${esc(MemoryKit.ETHICS.purpose)}</p><button class="text-link" data-action="page" data-page="memory">Cztery cnoty kardynalne · Pamięć projektu →</button></section><div class="banner"><span>ℹ️</span><span><b>Integracja pogodowa.</b> Pogoda pobierana automatycznie dla Katowic. Odczyty Setti+ są pobierane z publicznego pliku, a rzeczywiste odczyty ośmiu głowic znajdziesz w Panelu ogrzewania (bez sterowania urządzeniami). Aplikacja nie steruje ogrzewaniem. Twoje wpisy i historia gazu pozostają lokalnie w przeglądarce.</span></div>
<div class="grid cols3" style="margin-bottom:23px"><div class="stat"><div class="label">Kocioł · temperatura zadana</div><strong>${fmt(state.global.boiler,0)}°C</strong><small>BRÖTJE · ${boilerMode()} · <button class="text-link" data-action="page" data-page="boiler">Liczniki kotła →</button></small></div><div class="stat"><div class="label">ENGO · temperatura zadana</div><strong>${T(state.global.engo)}</strong><small>Sypialnia · steruje kotłem</small></div><div class="stat"><div class="label">Pomieszczenia z pomiarem</div><strong>${n} / 6</strong><small>Własne odczyty Setti+ · ${active?'trwa eksperyment':'brak aktywnego eksperymentu'}</small></div></div>
<div class="group-heading"><h3>Pomieszczenia</h3><span class="small muted">Kliknij, żeby wejść do pokoju</span></div><div class="grid cols3">${ROOMS.map(roomCard).join('')}</div>
<div class="grid cols2" style="margin-top:18px"><section class="card"><div class="group-heading"><h3>Licznik gazu i pogoda</h3><span class="pill">pogoda automatyczna</span></div><p class="subtitle" style="margin-bottom:16px"><b>${esc(weatherStatus())}</b><br>Temperatura zewnętrzna jest pobierana automatycznie z Open-Meteo. Wpisujesz jedynie stan gazomierza; bez internetu odczyt nadal można zapisać. <button class="text-link" data-action="page" data-page="insights">Analiza zużycia →</button></p><div class="form-grid"><div><label for="gas">Licznik gazu (m³)</label><input id="gas" type="number" step="0.001" min="0" placeholder="stan licznika"></div><div class="wide"><label for="sky">Warunki</label><select id="sky"><option value="unknown">Nie odnotowano</option><option value="sun">Słonecznie</option><option value="clouds">Pochmurno</option><option value="mixed">Zmiennie</option></select></div></div><div class="actions" style="margin-top:14px"><button class="action" data-action="record-conditions">Zapisz obserwację</button></div>${renderLastConditions()}</section>
<section class="card"><div class="group-heading"><h3>Co robimy teraz?</h3><span class="pill">Plan</span></div><p class="muted" style="font-size:13px;line-height:1.65">Zaplanuj jedną zmianę, np. położenia ENGO. Pozostałe nastawy pozostaw bez zmian. Porównuj temperaturę ENGO z T1 Setti+ oraz odczytem T6.</p><div class="note" style="margin-top:15px"><b>Uwaga przed testem:</b> sprawdź baterię termostatu i czujników przed dłuższym pomiarem.</div><div class="actions" style="margin-top:15px"><button class="action light" data-action="page" data-page="experiments">Przejdź do eksperymentów →</button></div></section></div>`}


/* Compact read-only overview: original forms and help remain available in a collapsed legacy section.
   Never infer live boiler firing, ENGO relay state or valve opening from these data. */
function boardModel(){
 const status=Setti.status();
 const rooms=ROOMS.map(room=>{
  const live=Setti.room(room.id),stale=!live?Setti.lastRoom(room.id):null;
  return {id:room.id,name:room.id==='hall'?'Korytarz':room.name,temp:live?.temp??null,
   display:live||stale||last(room.id),label:live?'Setti+ automatycznie':stale?'Setti+ · nieaktualne · Nieaktualny pomiar z':last(room.id)?'Wpis ręczny':'Brak pomiaru'};
 });
 const snapshot=haSnapshot||(typeof HeatingPreview!=='undefined'?HeatingPreview.devicePlaceholder:null);
 return HeatingBoard.model(state,gasViewState(),{rooms,roomsAt:status.at,snapshot,
  weather:Insights.near(state.weather?.hourly,Date.now())});
}
function renderHome(full=false){
 const message=[boardMessage,coStatus].filter(Boolean).join(' · ');
 return HeatingViews.dashboard(boardModel(),state,full,message);
}
function dateLocal(ts){return HeatingBoard.local(ts)}
function weatherStatus(){const w=state.weather||{hourly:[],updated:null},p=Insights.near(w.hourly,Date.now());return p?'Katowice: '+T(p.temp)+' · odczyt modelowy '+day(new Date(p.at*1000).toISOString()):w.hourly.length?'Katowice: brak aktualnej temperatury · ostatnia aktualizacja pogody: '+day(w.updated):'Katowice: oczekiwanie na dane pogodowe — wymagany internet.'}

function count(v){return Number(v).toLocaleString('pl-PL',{maximumFractionDigits:0})}
function boilerEntries(){return (state.boilerReadings||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))}
function boilerGain(previous,current,key){
 if(!Number.isSafeInteger(previous?.[key])||!Number.isSafeInteger(current?.[key]))return null;
 const diff=current[key]-previous[key];
 return diff>=0?diff:null; // Counter decrease/reset: never report negative energy consumption.
}
function renderBoiler(){
 const all=boilerEntries();
 const changing=editingBoiler?all.find(row=>row.id===editingBoiler):null;
 const entries=all.slice().reverse().map(row=>{
  const prior=HeatingBoard.counters(all,Date.parse(row.at),row.id);
  const facts=prior.filter(item=>row[item.key]!==null&&row[item.key]!==undefined).map(item=>{
   const gain=item.latest!==null&&row[item.key]>=item.latest?row[item.key]-item.latest:null;
   const result={...item,latest:row[item.key],gain,reset:item.latest!==null&&gain===null};
   return `<div><span>${item.key.toUpperCase()}</span><strong>${HeatingViews.counterValue(result)}</strong><small>${result.gain===null?HeatingViews.gainLabel(result):'Przyrost od '+day(item.at)+' · '+count(result.gain)+(item.key==='ac001'?' h':'')}</small></div>`;
  }).join('');
  return `<article class="card boiler-entry"><h3>${day(row.at)}</h3><div class="board-metrics board-counters">${facts}</div>
   ${row.note?`<p class="hint">${esc(row.note)}</p>`:''}
   <div class="actions"><button class="action ghost" data-action="edit-boiler" data-id="${esc(row.id)}">Edytuj</button>
   <button class="action danger" data-action="delete-boiler" data-id="${esc(row.id)}">Usuń</button></div></article>`;
 }).join('');
 return sec('Liczniki BRÖTJE','Ręczny dziennik odczytów QWHC.')+
  '<p class="hint">AC001 to godziny zasilania elektrycznego kotła. AC005 i AC006 pokazują surowe liczniki CO i CWU. Spadek lub reset kończy porównanie dla danego licznika.</p>'+
  HeatingViews.boilerForm(all,changing)+
  '<h3>Historia liczników</h3><div class="grid cols2">'+(entries||'<p>Brak wpisów.</p>')+'</div>';
}


function haSyncPanel(){
  return '<section class="card" style="margin-bottom:16px"><div class="group-heading"><h3>Historia automatyczna — Home Assistant</h3><span class="pill">szyfrowana · tylko odczyt</span></div>'+
   '<p class="hint">'+esc(haSyncLabel)+'</p>'+
   '<p class="hint">Szczegółowa historia jest przesyłana jako zaszyfrowany plik przez dotychczasowy GitHub. Hasło nie jest wysyłane do GitHub ani Home Assistant. Ta funkcja niczym nie steruje.</p>'+
   (!haUnlocked?'<div style="margin:12px 0"><label for="haPass">Hasło prywatnego archiwum</label><input id="haPass" type="password" autocomplete="off" placeholder="Hasło ustawione w eksporterze" maxlength="300"></div>':'')+
   '<div class="actions" style="margin-top:13px">'+
   (!haUnlocked?'<button class="action" data-action="ha-unlock">Połącz prywatną historię</button>':'<button class="action" data-action="ha-refresh">Synchronizuj teraz</button>')+
   '<button class="action ghost" data-action="ha-forget">Zapomnij klucz na tym urządzeniu</button></div>'+
   '<p class="hint">Historia gazu i kotła pozostaje prywatna i ręczna. W razie braku synchronizacji nadal działają importy CSV.</p></section>';
}
function renderEngo(){
 const entries=state.engoCycles||[],report=EngoCycles.analyze(entries);
 const recent=entries.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const editor=editingEngo?entries.find(r=>r.id===editingEngo):null;
 const latest=report.days[0]||null;
 let output=sec('Cykle ENGO','Historia żądań termostatu: automatyczna z Home Assistant lub awaryjnie z CSV ENGO Smart.');
 output+='<div class="banner info"><span>ℹ️</span><span>Wpisy są prywatne, tylko na tym urządzeniu. ON/OFF oznacza żądanie termostatu, a nie potwierdzoną pracę palnika. Wpisy ręczne CSV mają dokładność do minuty.</span></div>';
 let tools='';
 tools+='<section class="card" style="margin-bottom:16px"><h3>Import wielu zdarzeń ENGO</h3>'+
  '<p class="hint">Wklej CSV przygotowany na podstawie dziennika ENGO Smart. Jeden wiersz na zdarzenie: <b>data;godzina;stan</b>. Godziny dotyczą czasu polskiego. Na przykład:</p>'+
  '<pre class="engo-example">data;godzina;stan\n2024-01-01;08:00;ON\n2024-01-01;08:15;OFF</pre>'+
  '<label for="engoBulk">Zdarzenia do importu</label><textarea id="engoBulk" rows="9" placeholder="data;godzina;stan" style="width:100%">'+esc(engoImportDraft)+'</textarea>'+
  '<div class="actions" style="margin-top:12px"><button class="action" data-action="preview-engo">Sprawdź import</button><button class="action ghost" data-action="file-engo">Wczytaj plik CSV</button><button class="action ghost" data-action="clear-engo-import">Wyczyść</button></div></section>';
 if(pendingEngo){
  const previewRows=pendingEngo.preview.slice(0,40).map(r=>'<li>'+day(r.at)+' · <strong>'+(r.status==='on'?'WŁĄCZONE':'WYŁĄCZONE')+'</strong></li>').join('');
  tools+='<section class="card engo-preview" style="margin-bottom:16px"><h3>Podgląd przed zapisem</h3>'+
   '<p><strong>Nowe: '+pendingEngo.added+'</strong> · Pominięte duplikaty: '+pendingEngo.skipped+'</p>'+
   '<p class="hint">Wszystkie wiersze zostały sprawdzone. Istniejące dane nie zostaną zastąpione. Kolejność zostanie uporządkowana według daty.</p>'+
   (previewRows?'<ol class="engo-event-list">'+previewRows+'</ol>':'<p class="hint">Brak nowych zdarzeń do dopisania.</p>')+
   (pendingEngo.added>40?'<p class="hint">Wyświetlono pierwszych 40 nowych zdarzeń.</p>':'')+
   '<div class="actions"><button class="action" data-action="confirm-engo-import" '+(!pendingEngo.added?'disabled':'')+'>Zatwierdź import</button><button class="action ghost" data-action="cancel-engo-import">Anuluj</button></div></section>';
 }
 output+='<section class="card" style="margin-bottom:16px"><h3>Statystyki zapotrzebowania ENGO</h3>'+
   '<p class="hint">Liczymy tylko pełne pary WŁĄCZONE → WYŁĄCZONE; nie uzupełniamy brakujących zdarzeń przypuszczeniami.</p>';
 if(latest){
  const total=latest.minutes;
  output+='<div class="group-heading"><h4>Ostatni dzień z danymi: '+esc(latest.day)+'</h4></div>'+
   '<div class="panel-readings"><div><span>Pełne cykle rozpoczęte tego dnia</span><strong>'+latest.count+'</strong></div>'+
   '<div><span>Łączny czas</span><strong>'+fmt(total,0)+' min</strong></div>'+
   '<div><span>Średni cykl</span><strong>'+fmt(latest.avg,1)+' min</strong></div>'+
   '<div><span>Udział w obserwowanym przedziale</span><strong>'+(latest.ratio===null?'—':fmt(latest.ratio,1)+'%')+'</strong></div></div>'+
   '<p class="hint">Procent liczony od pierwszego do ostatniego zdarzenia danego dnia, a nie od całych 24 godzin. Przy cyklach przekraczających północ nie obliczamy tego procentu.</p>';
 }else output+='<p class="hint">Statystyki pojawią się po imporcie pierwszej pary zdarzeń.</p>';
 if(report.incomplete)output+='<div class="banner warn">Uwaga: '+report.incomplete+' zdarzeń lub par jest niekompletnych. Sprawdź, czy nie brakuje włączenia albo wyłączenia; te odcinki nie są doliczane do czasu.</div>';
 if(report.days.length)output+='<div class="engo-days">'+report.days.slice(0,14).map(d=>
  '<div class="engo-day"><b>'+esc(d.day)+'</b><span>'+d.count+' cykli · '+fmt(d.minutes,0)+' min'+(d.ratio===null?'':' · '+fmt(d.ratio,1)+'% obserwacji')+'</span></div>').join('')+'</div>';
 output+='</section>';
 if(editor){
  output+='<section class="card gas-edit" style="margin-bottom:16px"><h3>Popraw zdarzenie ENGO</h3><div class="form-grid">'+
   '<div><label for="engoEditAt">Data i godzina</label><input id="engoEditAt" type="datetime-local" value="'+EngoCycles.localDateTime(editor.at)+'"></div>'+
   '<div><label for="engoEditStatus">Stan</label><select id="engoEditStatus"><option value="on" '+(editor.status==='on'?'selected':'')+'>Włączone</option><option value="off" '+(editor.status==='off'?'selected':'')+'>Wyłączone</option></select></div></div>'+
   '<div class="actions"><button class="action" data-action="save-engo-edit">Zapisz poprawkę</button><button class="action ghost" data-action="cancel-engo-edit">Anuluj</button></div></section>';
 }
 output+='<section class="card"><h3>Historia zdarzeń ('+entries.length+')</h3>'+
  (recent.length?recent.slice(0,engoLimit).map(r=>
   '<div class="engo-history-item"><div><b>'+day(r.at)+'</b><div class="small muted">'+(r.status==='on'?'Żądanie ON':'Żądanie OFF')+' · '+(r.source==='ha-auto'?'Home Assistant':'wpis z ENGO Smart')+'</div></div>'+
   '<div class="gas-actions"><button class="action ghost" data-action="edit-engo" data-id="'+esc(r.id)+'">Edytuj</button>'+
   '<button class="action danger" data-action="delete-engo" data-id="'+esc(r.id)+'">Usuń</button></div></div>').join('')+
    (recent.length>engoLimit?'<button class="action ghost" data-action="more-engo">Pokaż starsze</button>':''):
   '<p class="hint">Nie zaimportowano jeszcze cykli. Wklej CSV, aby rozpocząć historię.</p>')+
   '</section>';
 return output+'<details class="card" '+(pendingEngo||engoImportDraft||!entries.length?'open':'')+
  '><summary>Import i połączenie HA</summary>'+tools+
  haSyncPanel()+'</details>';
}


function gasViewState(){
 const remote=GasSync.remoteReadings();
 if(!remote.length)return state;
 const ids=new Set((state.gasHistory||[]).map(x=>x.id));
 for(const [i,c] of (state.conditions||[]).entries()){
  if(typeof c.gas==='number'){
   ids.add(c.id||'c-'+Date.parse(c.at).toString(36)+'-'+i);
  }
 }
 const seen=new Set(Insights.readings(state).map(r=>r.meter+'|'+r.at+'|'+r.gas));
 const extras=remote.filter(r=>{
  const key=r.meter+'|'+Date.parse(r.at)+'|'+r.gas;
  if(ids.has(r.id)||GasSync.tracksLocal(r.id)||seen.has(key))return false;
  seen.add(key);return true;
 });
 return {...state,gasHistory:[...state.gasHistory,...extras]};
}
function renderGasSync(){
 const s=GasSync.status(),n=GasSync.remoteReadings().length;
 const header='<section class="card" style="margin-bottom:18px"><div class="group-heading"><h3>🔒 Prywatne archiwum gazomierza</h3><span class="pill">'+(s.connected?(s.role==='write'?'iPhone · zapis':'Telewizor · odczyt'):'niepołączone')+'</span></div>';
 const body='<p class="subtitle">Odczyty pozostają na tym urządzeniu. Po włączeniu synchronizacji trafiają przez Cloudflare wyłącznie do prywatnego GitHuba. Nie są publikowane na GitHub Pages.</p>'+
 '<p class="small muted" role="status">'+esc(s.message)+'</p>';
 if(!s.connected){
  return header+body+
   '<div class="form-grid"><div><label for="gasSyncRole">Uprawnienia tego urządzenia</label><select id="gasSyncRole"><option value="read">Tylko odczyt (telewizor)</option><option value="write">Zapis (iPhone)</option></select></div>'+
   '<div class="wide"><label for="gasSyncToken">KLUCZ z aplikacji Hasła Apple</label><input id="gasSyncToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="48 znaków; nie SHA256 i nie token GitHub"></div></div>'+
   '<div class="actions" style="margin-top:12px"><button class="action" data-action="gas-connect">Połącz prywatne archiwum</button></div>'+
   '<p class="hint">Klucz zostanie zapamiętany w pamięci tego urządzenia, jeśli przeglądarka obsługuje IndexedDB. Nie przesyłaj go w rozmowie ani na zrzucie ekranu.</p></section>';
 }
 let controls='<div class="actions"><button class="action light" data-action="gas-refresh">Pobierz dane z archiwum</button>';
 if(s.role==='write'){
  if(!s.active){
   controls+='<button class="action" data-action="gas-activate">Włącz wysyłanie i archiwizację odczytów</button>';
  }else{
   controls+='<button class="action" data-action="gas-sync-now">Synchronizuj teraz</button>';
  }
 }
 controls+='<button class="action ghost" data-action="gas-disconnect">Zapomnij klucz na tym urządzeniu</button></div>';
 const note=s.role==='write'?
  (s.active?'Wysyłanie jest włączone. Najpierw zapis lokalny, potem bezpieczne przesłanie. Przy braku internetu wpis zostaje na iPhonie.':
   'Dotychczasowa historia nie zostanie przesłana, dopóki nie potwierdzisz włączenia archiwizacji.') :
  'Tryb odczytu: możesz wyświetlać i analizować dane, ale nie możesz ich zmieniać w archiwum.';
 return header+body+'<p class="hint">Odczyty w archiwum: '+n+(s.remoteAt?' · pobrano '+day(s.remoteAt):'')+'. '+note+'</p>'+controls+'</section>';
}
function renderGasWhenIdle(){
 if(['gas-quick','co-quick','boiler-quick','air'].includes(page))return;
 const a=document.activeElement;
 if(!a||!['INPUT','TEXTAREA','SELECT'].includes(a.tagName))render();
}
function maybeSyncGas(){
 if(!GasSync.status().connected||GasSync.status().role!=='write'||!GasSync.status().active)return;
 gasQueued=true;
 if(gasSending)return;
 gasSending=true;
 const send=async()=>{
  while(gasQueued){
   gasQueued=false;
   try{await GasSync.synchronize(state);}catch(_){/* Keep the local result on network errors. */}
   if(lastGasId){
    const s=GasSync.status();
    boardMessage='Zapisano odczyt lokalnie. '+(GasSync.confirmed(lastGasId,state)?'Potwierdzono kopię w prywatnym archiwum.':s.message);
   }
   renderGasWhenIdle();
  }
 };
 return send().finally(()=>{gasSending=false;});
}
function gasSyncError(error){toast(error.message||'Synchronizacja niedostępna. Odczyty lokalne zachowano.');renderGasWhenIdle()}
function gasSyncOnLoad(){
 GasSync.restore().then(async connected=>{
  if(!connected)return;
  try{
   if(GasSync.status().role==='write'&&GasSync.status().active)await GasSync.synchronize(state);
   else await GasSync.refresh();
  }catch(_){/* Status shown in Gas and Weather; old data remain intact. */}
  renderGasWhenIdle();
 }).catch(()=>{});
}

function renderInsights(){
 const w=state.weather||{hourly:[],updated:null},view=gasViewState(),records=Insights.readings(view),rows=Insights.intervals(view),daily=Insights.dailyComparisons(view),events=(state.heatingEvents||[]).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const fdate=at=>new Date(at).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
 const trow=x=>'<tr><td>'+fdate(x.start)+' – '+fdate(x.end)+'</td><td>'+(x.meter==='old'?'Stary':'Nowy')+'</td><td>'+fmt(x.gas,2)+'</td><td>'+fmt(x.days,1)+'</td><td><b>'+fmt(x.perDay,2)+'</b>'+(x.estimated?' (szac.)':'')+'</td><td>'+(x.avg===null?'—':T(x.avg))+'</td><td>'+(x.normalized===null?'—':fmt(x.normalized,3))+'</td></tr>';
 const cardrow=x=>'<article class="gas-record"><div class="gas-record-header"><strong>'+fdate(x.start)+' – '+fdate(x.end)+'</strong><span class="pill">'+(x.meter==='old'?'Stary licznik':'Nowy licznik')+'</span></div><div class="gas-record-grid"><div><span>Zużycie</span><b>'+fmt(x.gas,2)+' m³</b></div><div><span>Średnio na dobę</span><b>'+(fmt(x.perDay,2)+' m³/dobę'+(x.estimated?' · szac.':''))+'</b></div><div><span>Okres</span><b>'+fmt(x.days,2)+' dnia</b></div><div><span>Śr. temp. zewn.</span><b>'+(x.avg===null?'—':T(x.avg))+'</b></div><div><span>m³/stopniodzień</span><b>'+(x.normalized===null?'—':fmt(x.normalized,3))+'</b></div></div></article>';
 return sec('Gaz i pogoda','Automatyczna temperatura dla Katowic, historia gazomierzy i zużycie w odniesieniu do pogody.')+HeatingViews.gasSummary(boardModel(),false)+gasEditor()+
 '<div class="banner info"><span>☁️</span><span><b>'+esc(weatherStatus())+'</b><br>Źródło: Open-Meteo, dane modelowe godzinowe. Aktualizacja po uruchomieniu aplikacji i na żądanie, gdy jest internet. Dane pogodowe zapisują się lokalnie. Nie są to pomiary z Twojego czujnika.</span></div>'+
 '<div class="actions" style="margin-bottom:16px"><button class="action light" data-action="refresh-weather">Odśwież pogodę</button><span class="small muted">Danych godzinowych: '+w.hourly.length+' · aktualizacja: '+(w.updated?day(w.updated):'brak')+'</span></div>'+
 '<div class="grid cols3" style="margin-bottom:18px"><div class="stat"><div class="label">Odczyty gazu</div><strong>'+records.length+'</strong><small>Łącznie z zapisanymi wcześniej obserwacjami</small></div><div class="stat"><div class="label">Interwały zużycia</div><strong>'+rows.length+'</strong><small>Porównania tylko w ramach jednego gazomierza</small></div><div class="stat"><div class="label">Wpisy ENGO</div><strong>'+events.length+'</strong><small>Zmiany historyczne do porównań</small></div></div>'+
 '<section class="card" style="margin-bottom:16px"><h3>Porównania dobowe</h3><p class="subtitle">Wyszukujemy odczyt najbliższy 24 godzinom przed końcem okresu, nawet jeśli pomiędzy nimi są inne wpisy. Odstęp 18–30 godzin.</p>'+(daily.length?daily.slice(0,20).map(x=>'<div class="item"><b>'+fmt(x.perDay,2)+' m³/dobę</b><div class="desc">'+day(new Date(x.start).toISOString())+' → '+day(new Date(x.end).toISOString())+' · '+fmt(x.gas,3)+' m³ / '+fmt(x.days*24,1)+' h · '+(x.meter==='old'?'stary':'nowy')+' gazomierz</div></div>').join(''):'<div class="empty">Brak porównań dobowych. Potrzebne są dwa odczyty tego samego gazomierza odległe o około dobę.</div>')+'</section>'+
 '<section class="card" style="margin-bottom:16px"><h3>Zużycie gazu między odczytami</h3><p class="subtitle" style="margin-bottom:14px">Rzeczywiste odczyty gazomierza. Współczynnik pogodowy: m³ na stopniodzień przy stałej temperaturze odniesienia 21,5°C, nie rzeczywista sprawność kotła. Odczyty ORLEN bez godziny są liczone orientacyjnie od południa; nie obejmuje to osobno ciepłej wody.</p>'+
 (rows.length?'<div class="table-scroll gas-table-wrap"><table class="table gas-table"><thead><tr><th>Okres</th><th>Gazomierz</th><th>m³</th><th>Dni</th><th>m³/dobę</th><th>Temp. zewn.</th><th>m³/stopniodzień</th></tr></thead><tbody>'+rows.slice(0,45).map(trow).join('')+'</tbody></table></div><div class="gas-mobile">'+rows.slice(0,45).map(cardrow).join('')+'</div><p class="hint">Średnia pogody i współczynnik pojawiają się tylko przy dostępności co najmniej 75% godzin w okresie. Dla krótszych niż 18 godzin odstępów m³/dobę jest orientacyjnym przeliczeniem, a nie pomiarem całej doby. Wskaźnika m³/stopniodzień nie liczymy dla takich okresów. Zmiana nastawy ENGO może wpływać na wynik.</p>':'<div class="empty">Dodaj dwa odczyty z tego samego gazomierza, aby obliczyć zużycie.</div>')+'</section>'+
 HeatingViews.gasForm()+
 '<div class="grid cols2"><section class="card">'+
 '<h3>Wklej wiele odczytów ORLEN</h3><p class="hint">Po jednym w wierszu: data;licznik;stan. Przykład: 2026-04-01;nowy;100. Licznik: nowy albo stary. Brak godziny oznacza przyjęcie 12:00. Import dodaje dane bez usuwania istniejących wpisów.</p><textarea id="gasBulk" rows="5" placeholder="RRRR-MM-DD;nowy;stan"></textarea><div class="actions" style="margin-top:10px"><button class="action ghost" data-action="bulk-gas">Dodaj wklejoną historię</button></div></section>'+
 '<section class="card"><h3>Historia nastaw ENGO</h3><p class="subtitle">Zapisuj także daty wcześniejszych zmian. ENGO nie jest połączony z aplikacją; wpisy są ręczne.</p>'+
 '<div class="form-grid" style="margin-top:15px"><div class="wide"><label for="engoAt">Data zmiany</label><input id="engoAt" type="datetime-local" value="'+dateLocal(Date.now())+'"></div><div><label for="engoHistoryValue">Nowa nastawa (°C)</label><input id="engoHistoryValue" type="number" step="0.5" min="10" max="30" value="'+esc(state.global.engo)+'"></div><div class="wide"><label for="engoHistoryNote">Komentarz</label><input id="engoHistoryNote" maxlength="300" placeholder="np. zmiana z 21,5 na 22°C"></div></div><div class="actions" style="margin-top:12px"><button class="action light" data-action="add-engo-history">Zapisz historyczną zmianę</button></div><div class="hr"></div>'+
 (events.length?events.slice(0,20).map(e=>'<div class="item"><b>'+T(e.engo)+'</b><div class="desc">'+day(e.at)+' · '+esc(e.note)+'</div></div>').join(''):'<p class="hint">Nie dodano jeszcze dat zmian ENGO.</p>')+'</section></div>'+
 '<section class="card" style="margin-top:16px"><h3>Historia odczytów</h3><p class="hint">Źródła: wpis ręczny, ORLEN albo wcześniejsza obserwacja w dzienniku. Wpisy lokalne są zachowane na tym urządzeniu. Odczyty z prywatnego archiwum mogą być dodatkowo wyświetlane.</p>'+
 (records.length?'<div class="table-scroll gas-history-table-wrap"><table class="table gas-history-table"><thead><tr><th>Data</th><th>Gazomierz</th><th>m³</th><th>Źródło</th><th>Setti+ w chwili wpisu</th><th>Poprawki</th></tr></thead><tbody>'+records.slice(-55).reverse().map(r=>'<tr><td>'+day(new Date(r.at).toISOString())+'</td><td>'+(r.meter==='old'?'Stary':'Nowy')+'</td><td>'+fmt(r.gas,3)+'</td><td>'+esc(r.source)+'</td><td>'+renderGasSetti(r.setti)+'</td><td>'+gasActions(r)+'</td></tr>').join('')+'</tbody></table></div><div class="gas-history-mobile">'+records.slice(-55).reverse().map(renderGasHistoryCard).join('')+'</div>':'<div class="empty">Jeszcze nie ma odczytów gazomierza.</div>')+'</section>';
}
async function syncWeather(force=false){
 if(typeof fetch!=='function'||navigator.onLine===false)return;
 if(!force&&state.weather?.updated&&Date.now()-Date.parse(state.weather.updated)<12*3600000)return;
 const was=state.weather||{hourly:[],updated:null};
 try{
   const updated=await Insights.refresh(was,fetch,Date.now());
   state.weather=updated;save();
   renderGasWhenIdle();
   if(force)toast('Pogoda została uaktualniona.');
 }catch(e){if(force)toast(e.message||'Nie udało się pobrać pogody.');}
}

function renderLastConditions(){let cs=state.conditions;if(!cs.length)return '<p class="hint">Brak dotychczasowych obserwacji.</p>';let x=cs.at(-1);let g=cs.filter(a=>a.gas!==null);let d=g.length>=2?g.at(-1).gas-g.at(-2).gas:null;return `<div class="hr"></div><div class="small muted">Ostatnia obserwacja: ${day(x.at)}. Na zewnątrz ${T(x.outdoor)}, licznik ${x.gas===null?'—':fmt(x.gas,3)+' m³'}. ${d!==null&&d>=0?'Przyrost między dwoma ostatnimi odczytami: '+fmt(d,3)+' m³.':''}</div>`}
function diag(r){if(!Setti.room(r.id)&&Setti.lastRoom(r.id))return ['Ostatni pomiar czujnika jest nieaktualny. Nie oceniaj na jego podstawie, czy pokój osiągnął temperaturę docelową.',''];let d=delta(r.id);if(d===null)return ['Ustal temperaturę docelową i wpisz odczyt Setti+ — dopiero wtedy można ocenić różnicę.',''];if(d<-.4){let en=state.global.engoCurrent;let tail=en!==null&&en>=state.global.engo-.1?' ENGO pokazuje temperaturę bliską zadanej, więc sprawdź, czy ogrzewanie nie kończy pracy, zanim ten pokój się nagrzeje.':' Sprawdź, czy ENGO aktualnie żąda ogrzewania, i czy grzejniki dostają ciepłą wodę.';return [`Temperatura jest o ${fmt(Math.abs(d))}°C poniżej celu. Najpierw sprawdź nastawy głowic, ich rzeczywiste otwarcie i położenie drzwi.${tail} Nie podnoś od razu nastawy kotła.`, 'cold']}if(d>.5)return [`Temperatura przekracza cel o ${fmt(d)}°C. Może to wynikać m.in. z nasłonecznienia albo zbyt dużego dopływu ciepła. Sprawdź trend i położenie drzwi przed zmianą głowic.`,'warn'];return ['Pomiar znajduje się blisko wybranego celu. Obserwuj stabilność i nie zmieniaj nastaw bez powodu.','']}
function tempInput(id,value,min=5,max=35,step='.5'){return `<input id="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${value===null||value===undefined?'':esc(value)}" placeholder="—">`}
function renderRoom(){let r=RM[currentRoom], st=state.rooms[r.id],rd=latestReading(r.id),diagx=diag(r);
const readings=Heads.lastSnapshot(),headsStatus=Heads.status();
const sources=`<section class="card"><h3>Czujnik pokojowy ${r.sensor}</h3><div class="board-metrics"><div><span>Temperatura</span><strong>${T(rd?.temp)}</strong></div><div><span>Wilgotność</span><strong>${Number.isFinite(rd?.humidity)?fmt(rd.humidity,0)+'%':'—'}</strong></div></div>
 <p class="hint">${Setti.room(r.id)?'Setti+ · automatycznie':Setti.lastRoom(r.id)?'Setti+ · dane nieaktualne':rd?'Zapis ręczny':'Brak pomiaru'}${rd?.at?' · '+day(rd.at):''}</p></section>
 ${r.rads.map(id=>{const h=readings?.heads[id.toLowerCase()];return `<section class="card"><h3>Głowica ${id}</h3><div class="board-metrics">
 <div><span>Przy głowicy</span><strong>${T(h?.temperature)}</strong></div><div><span>Nastawa</span><strong>${T(h?.target_temperature)}</strong></div>
 <div><span>Kalibracja</span><strong>${T(h?.calibration)}</strong></div><div><span>Tryb</span><strong>${h?esc(h.mode_raw):'—'}</strong></div></div>
 <p class="hint">Setti+ · ${esc(headsStatus.label)}${headsStatus.at?' · '+day(headsStatus.at):''}</p></section>`}).join('')}
 ${r.id==='smallbath'?HeatingViews.bath(haSnapshot,Date.now()):''}`;
return `<button class="back" data-action="page" data-page="rooms">Wróć do pomieszczeń</button>${sec(r.id==='hall'?'Korytarz':r.name,r.desc)}
<div class="board-grid room-instruments">${sources}</div>${HeatingViews.comfort(state,r.id)}
<div class="actions"><button class="action light" data-action="page" data-page="temperatures">Historia automatyczna</button></div><div class="grid cols2">
<div class="stack"><section class="card"><div class="group-heading"><h3>Temperatura komfortu</h3><span class="pill ${stat(r.id)[1]}">${stat(r.id)[0]}</span></div><div class="form-grid"><div><label for="target">Chcę mieć w pomieszczeniu (°C)</label>${tempInput('target',st.target,10,30,'.5')}<div class="hint">To Twój cel, niezależny od nastaw głowic.</div></div><div><label>Ostatni pomiar Setti+ (${r.sensor})</label><div class="field-value" style="font-size:29px;padding:4px 0">${rd?T(rd.temp):'—'}</div><div class="hint">${rd?(Setti.room(r.id)?'Automatycznie: ':Setti.lastRoom(r.id)?'Setti+ (nieaktualne): ':'Ręcznie: ')+day(rd.at):'Brak pomiaru'}</div></div></div><div class="actions" style="margin-top:14px"><button class="action light" data-action="save-target" data-room="${r.id}">Zapisz temperaturę docelową</button></div><div class="tip ${diagx[1]}">${diagx[0]}</div></section>
<details class="card"><summary>Awaryjny wpis pomiaru (${r.sensor})</summary><p class="subtitle" style="margin-bottom:16px">Wpisz wskazanie czujnika znajdującego się w pokoju, nie głowicy na grzejniku.</p><div class="form-grid"><div><label for="tempReading">Temperatura (°C)</label><input id="tempReading" type="number" inputmode="decimal" min="-10" max="45" step="0.1" placeholder="np. 21,8"></div><div><label for="humidityReading">Wilgotność (%) · opcjonalnie</label><input id="humidityReading" type="number" inputmode="decimal" min="0" max="100" step="1" placeholder="np. 49"></div><div class="wide"><label for="readNote">Komentarz (opcjonalnie)</label><input id="readNote" type="text" maxlength="200" placeholder="np. wieczór, bez słońca, drzwi zamknięte"></div></div><div class="actions" style="margin-top:14px"><button class="action" data-action="reading" data-room="${r.id}">Zapisz pomiar</button></div></details>
${r.id==='bedroom'?`<section class="card"><h3>ENGO Smart · oś ogrzewania</h3><p class="subtitle">Termostat jest w sypialni, lecz jego decyzja włącza albo wyłącza możliwość grzania w całym mieszkaniu.</p><div class="form-grid" style="margin-top:15px"><div><label>Temperatura zadana</label><div class="field-value" style="font-size:24px">${T(state.global.engo)}</div></div><div><label>Rzeczywisty odczyt ENGO</label><div class="field-value" style="font-size:24px">${T(state.global.engoCurrent)}</div></div></div><div class="hint">Aktualne położenie: ${esc(state.global.engoPlace||'Nie podano')}</div><div class="actions" style="margin-top:13px"><button class="action ghost" data-action="page" data-page="settings">Ustawienia ENGO →</button></div></section>`:''}
${r.id==='kitchen'?`<section class="card"><h3>Kocioł · wspólna nastawa</h3><p class="subtitle">BRÖTJE znajduje się w kuchni, ale temperatura wody wpływa na wszystkie grzejniki.</p><div style="font-size:29px;font-weight:800;margin:13px 0 5px">${fmt(state.global.boiler,0)}°C</div><div class="actions"><button class="action ghost" data-action="page" data-page="settings">Ustawienia kotła →</button></div><p class="hint">${boilerMode()}</p></section>`:''}</div>
<div class="stack"><details class="card"><summary>Zaawansowane wpisy ręczne urządzeń</summary>${r.rads.length?r.rads.map(id=>`<div class="item"><div class="item-row"><div><b>${id}</b><div class="desc">${esc(RADS[id])}</div></div><div class="setting"><label for="rad-${id}">Nastawa °C</label>${tempInput(`rad-${id}`,state.radiators[id],5,35,'.5')}</div></div></div>`).join('')+`<div class="actions" style="margin-top:15px"><button class="action light" data-action="save-radiators" data-room="${r.id}">Zapisz nastawy głowic</button></div><p class="hint">Wpisuj temperatury faktycznie ustawione na głowicach. Nie są równoznaczne z pomiarem w pokoju.</p>`:`<p class="muted" style="font-size:13px">Przedpokój ma własny czujnik T6, ale nie ma głowicy. Obserwuj temperaturę i sprawdzaj przepływ powietrza przez drzwi oraz wentylację.</p>`}
${r.id==='smallbath'?`<div class="hr"></div><b>GE1 · konwektor elektryczny</b><p class="desc">Pomocniczy sposób dogrzewania. Ten wpis pozostaje oddzielny od automatycznej telemetrii.</p><label for="electric" style="margin-top:12px">Ostatnio odnotowany stan</label><select id="electric" data-change="electric"><option value="" ${state.global.electric===null?'selected':''}>Nie zapisano</option><option value="on" ${state.global.electric==='on'?'selected':''}>Włączony</option><option value="off" ${state.global.electric==='off'?'selected':''}>Wyłączony</option></select>`:''}</details>
<section class="card"><div class="group-heading"><h3>Drzwi</h3><span class="pill">Wpływ na wymianę ciepła</span></div>${r.doors.map(id=>`<div class="item"><label for="door-${id}">${esc(DOORS[id].name)}</label><select id="door-${id}" data-change="door" data-id="${id}">${Object.entries(DOORSTATUS).map(([val,name])=>`<option value="${val}" ${state.doors[id]===val?'selected':''}>${name}</option>`).join('')}</select></div>`).join('')}<p class="hint">Stan jednych drzwi jest wspólny dla obu sąsiednich pomieszczeń. Nie zasłaniaj kratek wentylacyjnych.</p></section>
<section class="card"><div class="group-heading"><h3>Historia wpisanych ręcznie temperatur</h3><span class="pill">${st.readings.length} pomiarów</span></div>${chart(st.readings)}${st.readings.length?`<div class="table-scroll" style="margin-top:13px"><table class="table"><thead><tr><th>Data</th><th>Temperatura</th><th>Wilgotność</th></tr></thead><tbody>${st.readings.slice(-6).reverse().map(x=>`<tr><td>${day(x.at)}</td><td>${T(x.temp)}</td><td>${x.humidity===null?'—':fmt(x.humidity,0)+'%'}</td></tr>`).join('')}</tbody></table></div>`:''}</section></div></div>`}
function chart(readings){let a=readings.slice(-25);if(a.length<2)return '<div class="empty">Wykres pojawi się po zapisaniu co najmniej dwóch pomiarów.</div>';let W=620,H=210,m={l:35,r:20,t:20,b:35};let vals=a.map(x=>x.temp),min=Math.min(...vals)-.4,max=Math.max(...vals)+.4;let X=i=>m.l+(W-m.l-m.r)*i/(a.length-1),Y=v=>m.t+(H-m.t-m.b)*(max-v)/(max-min);let poly=a.map((x,i)=>`${X(i).toFixed(1)},${Y(x.temp).toFixed(1)}`).join(' ');return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykres temperatury z ${a.length} ostatnich pomiarów"><line x1="${m.l}" x2="${W-m.r}" y1="${Y(min)}" y2="${Y(min)}" stroke="#ccdccc"/><line x1="${m.l}" x2="${W-m.r}" y1="${Y(max)}" y2="${Y(max)}" stroke="#ccdccc"/><text x="5" y="${Y(max)+4}" fill="#688072" font-size="12">${fmt(max)}°</text><text x="5" y="${Y(min)+4}" fill="#688072" font-size="12">${fmt(min)}°</text><polyline points="${poly}" fill="none" stroke="#147b69" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${a.map((x,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(x.temp).toFixed(1)}" r="4" fill="#147b69"><title>${day(x.at)}: ${T(x.temp)}</title></circle>`).join('')}<text x="${m.l}" y="${H-8}" fill="#688072" font-size="11">${day(a[0].at)}</text><text x="${W-m.r}" y="${H-8}" text-anchor="end" fill="#688072" font-size="11">${day(a.at(-1).at)}</text></svg>`}
function renderExperiments(){let active=state.experiments.find(x=>x.status==='active');let finished=state.experiments.filter(x=>x.status==='done');return `${sec('Eksperymenty','Jedna świadoma zmiana, obserwacja efektu i porównanie wyników.')}<div class="banner warn"><span>⚗️</span><span><b>Podczas jednej próby zmieniaj tylko jeden element.</b> Warunki zewnętrzne też mogą wpływać na pomiary. Nie traktuj różnicy temperatury jako bezpośredniego pomiaru zużycia gazu.</span></div>${active?`<section class="card" style="border-color:#96c8b6;margin-bottom:18px"><div class="group-heading"><h3>Trwa: ${esc(active.title)}</h3><span class="pill ok">Aktywny</span></div><p class="small muted">Rozpoczęty: ${day(active.started)}</p><p style="margin-top:9px">${esc(active.description||'')}</p><div class="note" style="margin-top:13px">Na początku próby: kocioł ${fmt(active.start.boiler,0)}°C, ENGO ${T(active.start.engo)}, położenie ENGO: ${esc(active.start.engoPlace)}.</div><div class="form-grid" style="margin-top:15px"><div class="wide"><label for="finishNotes">Wnioski / komfort / różnice</label><textarea id="finishNotes" placeholder="Co zauważyłeś po 24–48 godzinach? Jakie były temperatury w pomieszczeniach?"></textarea></div></div><div class="actions" style="margin-top:12px"><button class="action" data-action="finish-exp" data-id="${esc(active.id)}">Zakończ próbę</button></div></section>`:`<section class="card" style="margin-bottom:18px"><h3>Rozpocznij nowy eksperyment</h3><p class="subtitle" style="margin-bottom:16px">Przed zmianą aplikacja zapisze migawkę wszystkich ustawień.</p><div class="form-grid"><div class="wide"><label for="expTitle">Nazwa eksperymentu</label><input id="expTitle" value="Przeniesienie termostatu ENGO" maxlength="100" placeholder="np. Położenie ENGO"></div><div class="wide"><label for="expDescription">Co dokładnie zmieniasz?</label><textarea id="expDescription" placeholder="Opisz jedną zmianę. Pozostałe nastawy pozostaw bez zmian.">Zmiana wyłącznie położenia ENGO. Bez zmiany temperatury zadanej kotła, ENGO i głowic. Porównanie odczytów T1 i T6 po 24–48 godzinach.</textarea></div></div><div class="actions" style="margin-top:13px"><button class="action" data-action="start-exp">Rozpocznij i zapisz ustawienia początkowe</button></div></section>`}<section class="card"><div class="group-heading"><h3>Wcześniejsze eksperymenty</h3><span class="pill">${finished.length}</span></div>${finished.length?finished.map(x=>`<div class="item"><b>${esc(x.title)}</b><div class="desc">${day(x.started)} → ${day(x.ended)}</div>${x.notes?`<p style="font-size:13px;margin-top:8px">${esc(x.notes)}</p>`:''}<div class="note" style="margin-top:9px">ENGO ${T(x.start.engo)} → ${T(x.end.engo)} · Kocioł ${fmt(x.start.boiler,0)}°C → ${fmt(x.end.boiler,0)}°C · Położenie ENGO: ${esc(x.start.engoPlace)} → ${esc(x.end.engoPlace)}</div></div>`).join(''):'<div class="empty">Nie ma jeszcze zakończonych eksperymentów.</div>'}</section>`}
function renderHistory(){let ev=state.events.slice(0,historyLimit);return `${sec('Historia zmian','Wszystkie zapisane nastawy i pomiary — żebyś wiedział, co naprawdę zmieniono.') }<div class="actions" style="margin-bottom:17px"><button class="action light" data-action="export-json">Eksportuj kopię JSON</button><button class="action ghost" data-action="export-csv">Pobierz pomiary CSV</button></div><section class="card"><div class="group-heading"><h3>Dziennik</h3><span class="pill">${state.events.length} wpisów</span></div>${ev.length?`<div class="timeline">${ev.map(x=>`<div class="event"><span class="event-marker"></span><div><strong>${esc(x.label)}</strong><div class="muted small">${esc(x.detail)}</div><small>${day(x.at)}</small></div></div>`).join('')}</div>${state.events.length>historyLimit?'<button class="action ghost" data-action="more-history">Pokaż starsze wpisy</button>':''}`:'<div class="empty">Historia będzie się uzupełniać przy zapisywaniu celów, głowic, drzwi i pomiarów.</div>'}</section>`}
function renderMap(){return `${sec('Mapa mieszkania','Prywatny plan przechowywany wyłącznie na tym urządzeniu.')}<div class="banner info">Publiczna aplikacja nie zawiera planu, wymiarów ani adresu. Możesz wczytać własną mapę SVG, PNG lub JPEG. Trafi tylko do lokalnego zapisu i Twojej kopii JSON.</div><section class="card">${state.privateMap?`<img class="map" alt="Twoja prywatna mapa" src="${esc(state.privateMap)}">`:'<div class="empty">Nie wczytano prywatnej mapy.</div>'}<div class="actions" style="margin-top:15px"><button class="action ghost" data-action="map-import">Wczytaj prywatną mapę</button>${state.privateMap?'<button class="action ghost" data-action="map-download">Pobierz mapę</button>':''}</div></section>`}
function boilerSyncSettings(){
 const s=BoilerSync.status();
 const status=!s.paired?'Tryb lokalny. Wpis nie pojawi się w Home Assistant ani na TV do czasu połączenia.':
  !s.fresh||s.record?.value!==state.global.boiler?'Ostatni lokalny wpis. Brak aktualnego potwierdzenia z Home Assistant.':
  'Nastawa potwierdzona przez Home Assistant.';
 return `<div class="note" style="margin-top:13px"><p>${esc(status)} ${esc(s.message)}</p>
 <input type="hidden" id="boilerRevision" value="${s.record?.revision??''}">
 <details style="margin-top:8px"${s.message&&!s.paired?' open':''}><summary>Połączenie z prywatnym Home Assistant</summary>
 <label for="boilerSyncHost">Adres HTTPS Home Assistant w Tailscale</label>
 <input id="boilerSyncHost" type="url" autocomplete="off" value="${esc(s.host)}">
 <label for="boilerSyncKey">Klucz nastawy CO</label><input type="password" id="boilerSyncKey" autocomplete="off">
 <button class="action light" data-action="boiler-sync-connect">Połącz</button></details>
 ${s.paired?'<button class="text-link" data-action="boiler-sync-refresh">Odśwież nastawę</button>':''}
 ${s.paired&&lastCo()?.source==='manual'&&(!s.fresh||s.record?.value!==state.global.boiler)
  ?'<button class="text-link" data-action="boiler-send-local">Wyślij zapisaną notatkę do HA</button>':''}</div>`;
}
function lastCo(){return state.coHistory?.at(-1);}
function applyBoilerNote(note){
 if(!note||note.value===null)return;
 const last=lastCo();
 // A local declaration stays visible until it is sent or a newer HA note arrives.
 if(last?.source==='manual'&&Date.parse(last.at)>Date.parse(note.updated_at)&&
    last.value!==note.value)return;
 if(last?.source==='ha'&&last.value===note.value&&last.at===note.updated_at)return;
 const old=state.global.boiler;
 state.global.boiler=note.value;
 (state.coHistory??=[]).push({id:recordId('co'),at:note.updated_at,value:note.value,source:'ha'});
 if(old!==note.value)changeLog('Notatka CO z Home Assistant',fmt(old,0)+'°C → '+fmt(note.value,0)+'°C');
 try{save();}catch(error){state=DataStore.current(seed);throw Error('Nie zapisano lokalnie notatki z Home Assistant. '+error.message);}
}
function renderBoilerWhenIdle(){
 const status=document.querySelector?.('[data-co-status]');
 if(status)status.textContent=coStatus;
 renderGasWhenIdle();
}
async function refreshBoiler(show=false){
 if(!BoilerSync.status().paired||coSending)return;
 try{applyBoilerNote(await BoilerSync.refresh());if(show)toast('Odczytano notatkę CO z Home Assistant.');}
 catch(error){if(show)toast(error.message);}
 if(show)render();else renderBoilerWhenIdle();
}
function boilerMode(){
 const s=BoilerSync.status();
 return s.paired?(s.fresh&&s.record?.value===state.global.boiler?'Potwierdzona notatka w HA':'Wpis lokalny · brak potwierdzenia HA'):'Wpis lokalny';
}
async function sendCo(row,confirmLatest=false){
 if(coSending||!BoilerSync.status().paired)return;
 coSending=true;
 try{
  if(lastCo()?.id!==row.id)return;
  if(confirmLatest){
   const remote=await BoilerSync.refresh();
   if(!remote)return;
   if(remote.value===row.value)coStatus='Home Assistant potwierdza tę wartość.';
   else{
    if(!confirm('Zapisana lokalnie notatka '+fmt(row.value,0)+'°C. W Home Assistant '+T(remote.value)+'. Wysłać lokalną notatkę?'))return;
    if(lastCo()?.id!==row.id)return;
    await BoilerSync.write(row.value,remote.revision);
    coStatus='Notatka CO potwierdzona przez Home Assistant.';
   }
  }else{
   const remote=BoilerSync.status().record;
   await BoilerSync.write(row.value,remote?.revision);
   coStatus='Notatka CO potwierdzona przez Home Assistant.';
  }
 }catch(error){coStatus='Notatka zapisana na urządzeniu. '+error.message;}
 finally{coSending=false;renderBoilerWhenIdle();}
}
function renderSettings(){let g=state.global;return `${sec('Ustawienia wspólne','Zadane temperatury kotła i ENGO mają wpływ na całe mieszkanie.')}<div class="grid cols2"><section class="card"><h3>BRÖTJE · kocioł</h3><p class="subtitle" style="margin-bottom:15px">Zadana temperatura wody na zasilaniu. Odczyt bieżący na wyświetlaczu może być inny.</p><label for="boilerSet">Temperatura zadana kotła (°C)</label>${tempInput('boilerSet',g.boiler,25,85,1)}<p class="hint">Wpisz wartość odczytaną z ręcznej nastawy CO. Zapis aktualizuje wyłącznie informację.</p><div class="actions" style="margin-top:14px"><button class="action" data-action="set-boiler">Zapisz nastawę kotła</button></div>${boilerSyncSettings()}</section><section class="card"><h3>ENGO Smart · sypialnia</h3><p class="subtitle" style="margin-bottom:15px">Termostat wyznacza zapotrzebowanie na ogrzewanie dla całego mieszkania.</p><div class="form-grid"><div><label for="engoSet">Temperatura zadana (°C)</label>${tempInput('engoSet',g.engo,10,30,'.5')}</div><div><label for="engoCurrent">Aktualny odczyt ENGO (°C)</label>${tempInput('engoCurrent',g.engoCurrent,0,45,'.1')}</div><div class="wide"><label for="engoPlace">Położenie termostatu</label><input id="engoPlace" value="${esc(g.engoPlace)}" maxlength="220"></div></div><div class="actions" style="margin-top:14px"><button class="action" data-action="set-engo">Zapisz ustawienia ENGO</button></div><p class="hint">Po przeniesieniu termostatu wpisz nowe miejsce. Aplikacja zachowa zmianę w dzienniku.</p></section></div><section class="card" style="margin-top:16px"><div class="group-heading"><h3>Twoje dane i kopie zapasowe</h3><span class="pill">bez konta</span></div><p class="muted" style="font-size:13px;margin-bottom:17px">Dane są przechowywane lokalnie w tej przeglądarce na tym urządzeniu. Aktualizacja pod tym samym adresem zachowuje dane. Wyczyszczenie Safari, usunięcie aplikacji lub zmiana urządzenia mogą je usunąć. Regularnie zapisuj JSON w Plikach / iCloud. Przenosząc dane ze starej wersji lub między Safari a aplikacją z ekranu początkowego, użyj eksportu i importu JSON.</p><div class="actions filecontrols"><button class="action light" data-action="export-json">Pobierz kopię JSON</button><button class="action ghost" data-action="import-json">Wczytaj kopię JSON</button><button class="action ghost" data-action="export-csv">Pobierz pomiary CSV</button><button class="action ghost" data-action="recover">Przywróć poprzedni zapis</button><button class="action ghost" data-action="persist">Chroń zapis na urządzeniu</button><button class="action danger" data-action="reset">Wyczyść dane</button></div><div class="hr"></div><p class="footer-note">Aplikacja odczytuje publiczny plik z pomiarami Setti+, ale nie łączy się bezpośrednio z urządzeniami ani nie wysyła poleceń. Gdy pomiary są nieaktualne, możesz je nadal wpisać ręcznie.</p></section>`}
function render(){
 renderNav();
 const screens={
  home:()=>renderHome(),dashboard:()=>renderHome(true),rooms:()=>HeatingViews.rooms(boardModel()),
  analysis:HeatingViews.analysis,more:HeatingViews.more,
  'gas-quick':()=>HeatingViews.gasForm(true),'co-quick':()=>HeatingViews.coForm(state,coStatus),
  'boiler-quick':()=>HeatingViews.boilerForm(boilerEntries(),null,true),
  air:()=>HeatingViews.air(state,airChoice,airOpening,airEdit),
  room:renderRoom,heads:renderHeads,boiler:renderBoiler,'engo-cycles':renderEngo,
  temperatures:()=>TemperatureView.render(state,tempDay,tempVisible,tempPreview,tempImportDraft),
  review:()=>ReviewView.render(state,reviewPeriod,editingDecision,MemoryKit.augment(HeatingReview.build(state,reviewPeriod),state)),
  memory:()=>MemoryView.render(state,memoryPreview,memoryImportDraft),insights:renderInsights,legacy:renderHomeLegacy,
  experiments:renderExperiments,history:renderHistory,map:renderMap,settings:renderSettings,
  connections:()=>sec('Dane i połączenia','Źródła oraz synchronizacja.')+renderGasSync()+haSyncPanel()+settiBanner()+boilerSyncSettings()
 };
 const preview=typeof HeatingPreview!=='undefined';
 const container=document.getElementById('view');
 container.innerHTML=(preview?'<p class="preview-label">'+esc(HeatingPreview.label||'WERSJA TESTOWA · DANE FIKCYJNE')+
  '</p>'+(HeatingPreview.status||''):'')+
  (screens[page]||screens.home)()+
  `<div class="footer">Moje Ogrzewanie v1.9.0 · ${GasSync.status().active&&GasSync.status().connected?'Gaz: synchronizacja prywatna aktywna':'Wpisy lokalne na tym urządzeniu'}</div>`;
 if(preview)HeatingPreview.updateStatus?.();
 if(page==='insights'||page==='gas-quick')updateGasPreview();
 if(page==='boiler'||page==='boiler-quick')updateCounterPreview();
}
function recordId(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
function updateGasPreview(){
 const previous=document.getElementById('gasPrevious'),difference=document.getElementById('gasDifference');
 const meter=document.getElementById('gasMeter'),at=document.getElementById('gasAt'),input=document.getElementById('gasValue');
 if(!previous||!difference||!meter||!at||!input)return;
 const time=HeatingBoard.parseLocal(at.value),label=meter.value==='old'?'Stary gazomierz':'Obecny gazomierz';
 const row=HeatingBoard.precedingGas(gasViewState(),meter.value,Number.isFinite(time)?time:Date.now());
 previous.textContent=label+' · '+(row?fmt(row.gas,3)+' m³ · '+day(row.at):'Brak wcześniejszego odczytu');
 const value=input.value.trim();
 const numeric=Number(value.replace(',','.'));
 const diff=row&&value&&Number.isFinite(numeric)?numeric-row.gas:null;
 difference.textContent=diff===null?'':diff<0?'Spadek wskazania · sprawdź gazomierz lub datę.':'Różnica od poprzedniego odczytu · +'+fmt(diff,3)+' m³';
}
function updateCounterPreview(){
 const selected=document.getElementById('boilerAt');
 if(!selected)return;
 const at=HeatingBoard.parseLocal(selected.value);
 const prior=HeatingBoard.counters(boilerEntries(),Number.isFinite(at)?at:Date.now(),editingBoiler);
 const inputs=['boilerAc001','boilerAc005','boilerAc006'];
 prior.forEach((row,i)=>{
  const field=document.getElementById(inputs[i]),value=Number(field?.value);
  const previous=document.getElementById('previous-'+row.key),gain=document.getElementById('gain-'+row.key);
  if(!previous||!gain)return;
  previous.textContent=row.at?HeatingViews.counterValue(row)+' · '+day(row.at):'Brak wcześniejszego odczytu';
  gain.textContent=!field?.value||row.latest===null||!Number.isSafeInteger(value)?'':
   value<row.latest?'Spadek lub reset · brak przyrostu':'Przyrost +'+count(value-row.latest)+(row.key==='ac001'?' h':'');
 });
}
function stopAir(row,end,corrected=false){
 const previous=row.ended;
 row.ended=end;
 if(corrected)row.corrections.push({at:now(),previous,ended:end});
 changeLog(corrected?'Poprawiono wietrzenie':'Zakończono wietrzenie',row.windows.join(' + ')+' · '+day(end));
 save();airEdit=null;boardMessage='Zapisano wietrzenie · '+HeatingBoard.elapsed(Date.parse(end)-Date.parse(row.started))+'.';
 toast(boardMessage);return render();
}
function numInput(id,min,max,allowEmpty=true){let e=document.getElementById(id);if(!e)return {ok:false};let raw=e.value.trim().replace(',','.');if(raw===''&&allowEmpty)return{ok:true,value:null};let v=Number(raw);if(raw===''||!Number.isFinite(v)||v<min||v>max){toast(`Sprawdź pole: ${id}. Dozwolony zakres ${min}–${max}.`);e.focus();return{ok:false}}return{ok:true,value:v}}
function changed(a,b){return a!==b}
function handleClick(e){let btn=e.target.closest('[data-action]');if(!btn)return;let ac=btn.dataset.action;
if(ac==='page')return setPage(btn.dataset.page);
if(ac==='comfort'){
 const score=Number(btn.dataset.score);
 if(!Number.isInteger(score)||score<1||score>5||!RM[currentRoom])return;
 const note=document.getElementById('comfortNote').value.trim().slice(0,200);
 (state.comfort??=[]).push({id:recordId('comfort'),room:currentRoom,score,at:now(),note});
 changeLog('Komfort: '+RM[currentRoom].name,score+' z 5');save();toast('Zapisano odczuwalny komfort.');return render();
}
if(ac==='air-preset'){
 airChoice=new Set(btn.dataset.set.split(' ').filter(key=>HeatingBoard.windows.includes(key)));return render();
}
if(ac==='air-start'){
 if(!airChoice.size||(state.ventilation||[]).some(row=>!row.ended))return;
 (state.ventilation??=[]).push({id:recordId('air'),started:now(),ended:null,windows:[...airChoice].sort(),opening:airOpening,corrections:[]});
 changeLog('Rozpoczęto wietrzenie',[...airChoice].join(' + '));save();boardMessage='Zapisano początek wietrzenia.';return render();
}
if(ac==='air-stop'){
 const row=(state.ventilation||[]).find(item=>!item.ended);
 if(row)return stopAir(row,now());
 return;
}
if(ac==='air-edit'){airEdit=btn.dataset.id;render();document.getElementById('airEnd')?.focus();return;}
if(ac==='air-cancel'){airEdit=null;return render();}
if(ac==='air-correct'){
 const row=(state.ventilation||[]).find(item=>item.id===airEdit);
 if(!row)return;
 const end=HeatingBoard.parseLocal(document.getElementById('airEnd').value,document.getElementById('airOffset').value);
 if(!Number.isFinite(end)||end<Math.floor(Date.parse(row.started)/1000)*1000||end>Date.now())
  return toast('Wybierz poprawny koniec po START. Jeśli godzina wystąpiła dwa razy, wybierz odpowiednią strefę.');
 return stopAir(row,new Date(Math.max(Date.parse(row.started),end)).toISOString(),true);
}




if(ac==='memory-card-save'){
 const card={};
 for(const field of MemoryKit.CARD_FIELDS){
   const value=document.getElementById('memory-'+field).value.trim();
   const max=field==='currentQuestion'?1500:field==='comfort'||field==='constraints'?3000:4000;
   if(value.length>max)return toast('Za długi wpis w karcie projektu.');
   card[field]=value;
 }
 if(!confirm('Zapisać kartę projektu? Jej treść będzie trafiała do eksportowanych prywatnie raportów ChatGPT.'))return;
 state.projectMemory={...card,updatedAt:now()};
 changeLog('Zaktualizowano kartę projektu','Zapisano opis instalacji i priorytety analityczne.');
 save();toast('Zapisano trwałą kartę projektu.');return render();
}
if(ac==='memory-add'){
 const raw={kind:document.getElementById('memoryKind').value,
   title:document.getElementById('memoryTitle').value,
   conclusion:document.getElementById('memoryConclusion').value,
   evidence:document.getElementById('memoryEvidence').value,
   conditions:document.getElementById('memoryConditions').value,
   confidence:document.getElementById('memoryConfidence').value,
   outcome:document.getElementById('memoryOutcome').value,
   experimentId:document.getElementById('memoryExperiment').value==='none'?null:document.getElementById('memoryExperiment').value};
 let record;
 try{record=MemoryKit.createRecord(raw,'manual')}catch(err){return toast(err.message)}
 if(record.experimentId&&!state.experiments.some(x=>x.id===record.experimentId))
   return toast('Powiązany eksperyment nie istnieje.');
 if((state.knowledgeLog||[]).length>=4000)return toast('Limit wpisów wiedzy. Zapisz kopię danych.');
 if(!confirm('Dopisać nowy wniosek do trwałej pamięci projektu?'))return;
 state.knowledgeLog.push(record);
 changeLog('Nowy wniosek o ogrzewaniu',record.title);
 save();toast('Wniosek dopisany do pamięci projektu.');return render();
}
if(ac==='memory-supersede'){
 const id=btn.dataset.id,entry=(state.knowledgeLog||[]).find(x=>x.id===id);
 if(!entry||entry.status!=='current')return toast('Nie odnaleziono aktualnego wniosku.');
 if(!confirm('Oznaczyć ten wniosek jako zastąpiony? Zachowamy go w historii, ale nie będzie obowiązującą wiedzą.'))return;
 entry.status='superseded';
 changeLog('Zastąpiono wniosek',entry.title);
 save();toast('Zachowano w historii jako zastąpiony.');return render();
}
if(ac==='memory-copy-intro'||ac==='memory-copy-request'){
 const content=ac==='memory-copy-intro'?MemoryKit.CHAT_INSTRUCTIONS:MemoryKit.PROPOSAL_INSTRUCTIONS;
 if(!navigator.clipboard?.writeText)return toast('Kopiowanie niedostępne. Skopiuj instrukcję ręcznie.');
 navigator.clipboard.writeText(content).then(()=>toast('Skopiowano instrukcję.')).catch(()=>toast('Nie udało się skopiować instrukcji.'));
 return;
}
if(ac==='memory-import-file')return document.getElementById('memoryFile').click();
if(ac==='memory-clear'){memoryPreview=null;memoryImportDraft='';return render()}
if(ac==='memory-cancel'){memoryPreview=null;return render()}
if(ac==='memory-preview'){
 memoryImportDraft=document.getElementById('memoryBulk').value;
 try{memoryPreview=MemoryKit.parseProposal(memoryImportDraft,state.knowledgeLog||[],state.experiments||[])}
 catch(err){memoryPreview=null;return toast(err.message)}
 return render();
}
if(ac==='memory-confirm'){
 if(!memoryPreview)return toast('Sprawdź propozycje przed zatwierdzeniem.');
 let result;
 try{result=MemoryKit.parseProposal(memoryImportDraft,state.knowledgeLog||[],state.experiments||[])}
 catch(err){memoryPreview=null;return toast(err.message)}
 if(!result.items.length)return toast('Brak nowych wniosków do dopisania.');
 if((state.knowledgeLog||[]).length+result.items.length>4000)return toast('Przekroczono limit pamięci projektu.');
 if(!confirm('Dopisać '+result.items.length+' propozycji po Twojej ocenie? Oryginalna historia pozostanie bez zmian.'))return;
 const recordedAt=now();
 for(const item of result.items)state.knowledgeLog.push(MemoryKit.createRecord(item,'chatgpt-reviewed',recordedAt));
 changeLog('Zaakceptowano nowe wnioski z ChatGPT','Dodano '+result.items.length+' wpisów, pominięto '+result.duplicates+' duplikatów.');
 save();memoryPreview=null;memoryImportDraft='';toast('Dopisano '+result.items.length+' wniosków.');return render();
}

if(ac==='review-export')return exportAnalysisReport();
if(ac==='review-copy'){
 const content=MemoryKit.augment(HeatingReview.build(state,reviewPeriod,analysisSources()),state).readable_summary;
 if(!navigator.clipboard?.writeText)return toast('Kopiowanie niedostępne. Pobierz plik JSON.');
 navigator.clipboard.writeText(content).then(()=>toast('Skopiowano podsumowanie raportu.')).catch(()=>toast('Nie udało się skopiować. Pobierz plik JSON.'));
 return;
}
if(ac==='review-edit'){
 const id=btn.dataset.id;
 if(!(state.decisionLog||[]).some(d=>d.id===id))return toast('Nie odnaleziono oceny.');
 editingDecision=id;return render();
}
if(ac==='review-cancel'){editingDecision=null;return render()}
if(ac==='review-delete'){
 const id=btn.dataset.id,idx=(state.decisionLog||[]).findIndex(d=>d.id===id);
 if(idx<0)return toast('Nie odnaleziono oceny.');
 if(!confirm('Usunąć tę ocenę i decyzję z dziennika? Najpierw warto pobrać kopię JSON.'))return;
 const entry=state.decisionLog[idx];
 state.decisionLog.splice(idx,1);
 changeLog('Usunięto ocenę ogrzewania',day(entry.at)+' · '+entry.choice);
 save();editingDecision=null;toast('Usunięto ocenę.');return render();
}
if(ac==='review-save'){
 const choice=document.getElementById('reviewChoice').value;
 const assessment=document.getElementById('reviewAssessment').value.trim();
 const action=document.getElementById('reviewAction').value.trim();
 const reviewOn=document.getElementById('reviewOn').value;
 const experimentId=document.getElementById('reviewExperiment').value||null;
 if(!['keep','observe','experiment'].includes(choice))return toast('Wybierz jedną z trzech decyzji.');
 if(!assessment||assessment.length>4000||action.length>1500)return toast('Wpisz ocenę (do 4000 znaków) i działanie (do 1500 znaków).');
 if(reviewOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(reviewOn)||new Date(reviewOn+'T12:00:00Z').toISOString().slice(0,10)!==reviewOn))
   return toast('Sprawdź datę ponownej oceny.');
 if(experimentId&&!state.experiments.some(e=>e.id===experimentId))return toast('Nie znaleziono eksperymentu.');
 const existing=editingDecision?(state.decisionLog||[]).find(d=>d.id===editingDecision):null;
 if(editingDecision&&!existing)return toast('Nie znaleziono edytowanej oceny.');
 const b=HeatingReview.bounds(reviewPeriod);
 const entry={id:existing?.id||'ocena-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
   at:existing?.at||now(),periodStart:existing?.periodStart||new Date(b.start).toISOString(),
   periodEnd:existing?.periodEnd||new Date(b.end).toISOString(),periodKey:existing?.periodKey||reviewPeriod,
   choice,assessment,action,reviewOn:reviewOn||null,experimentId,
   settings:existing?.settings||{boiler:state.global.boiler,engo:state.global.engo}};
 if(!confirm('Zapisać '+(existing?'poprawioną ':'')+'ocenę: '+ReviewView.OPTIONS[choice]+'?'))return;
 if(existing)state.decisionLog[state.decisionLog.findIndex(d=>d.id===existing.id)]=entry;
 else state.decisionLog.push(entry);
 changeLog(existing?'Poprawiono ocenę ogrzewania':'Ocena ogrzewania i decyzja',ReviewView.OPTIONS[choice]+' · '+assessment.slice(0,160));
 save();editingDecision=null;toast('Zapisano ocenę i decyzję.');return render();
}

if(ac==='temp-file')return document.getElementById('tempFile').click();
if(ac==='temp-clear'){tempImportDraft='';tempPreview=null;return render()}
if(ac==='temp-cancel'){tempPreview=null;return render()}
if(ac==='temp-preview'){
 tempImportDraft=document.getElementById('tempBulk').value;
 try{tempPreview=TemperatureHistory.parse(tempImportDraft,state.temperatureHistory||[])}
 catch(error){tempPreview=null;return toast(error.message)}
 return render();
}
if(ac==='temp-confirm'){
 if(!tempPreview)return toast('Najpierw sprawdź import temperatur.');
 const parsed=TemperatureHistory.parse(tempImportDraft,state.temperatureHistory||[]);
 if(!parsed.added)return toast('Wszystkie odczyty już istnieją.');
 if(!confirm('Dopisać '+parsed.added+' nowych pomiarów temperatury Setti+?'))return;
 state.temperatureHistory=parsed.rows;
 changeLog('Import historii temperatur Setti+','Dodano '+parsed.added+' zmian temperatury z Home Assistant; duplikaty: '+parsed.skipped+'.');
 save();
 tempDay=TemperatureHistory.days(parsed.preview)[0]||null;
 tempPreview=null;tempImportDraft='';
 toast('Dodano '+parsed.added+' odczytów temperatury.');return render();
}
if(ac==='temp-toggle'){
 const room=btn.dataset.room;
 if(!Object.prototype.hasOwnProperty.call(TemperatureHistory.roomNames,room))return;
 if(tempVisible.has(room))tempVisible.delete(room);else tempVisible.add(room);
 return render();
}
if(ac==='temp-delete-day'){
 const day=btn.dataset.day;
 if(!TemperatureHistory.days(state.temperatureHistory||[]).includes(day))return toast('Nie odnaleziono tego dnia.');
 const count=state.temperatureHistory.filter(r=>TemperatureHistory.dayKey(r.at)===day).length;
 if(!confirm('Usunąć '+count+' pomiarów temperatury z dnia '+day+'? Warto najpierw pobrać kopię JSON.'))return;
 state.temperatureHistory=state.temperatureHistory.filter(r=>TemperatureHistory.dayKey(r.at)!==day);
 changeLog('Usunięto historię temperatur Setti+',day+' · '+count+' odczytów');
 save();tempDay=null;toast('Usunięto '+count+' odczytów.');return render();
}

if(ac==='ha-unlock'){
 const el=document.getElementById('haPass'),pass=el?.value||'';
 if(el)el.value='';
 return syncHa(true,pass);
}
if(ac==='ha-refresh')return syncHa(true);
if(ac==='ha-forget'){
 if(!confirm('Zapomnieć klucz szyfrowania na tym iPhonie? Historia już zapisana w aplikacji pozostanie bez zmian.'))return;
 HaSync.forget().then(()=>{haSnapshot=null;haUnlocked=false;haSyncLabel='Klucz odłączony. Dotychczasowa historia pozostała bez zmian.';render()});
 return;
}
if(ac==='file-engo')return document.getElementById('engoFile').click();
if(ac==='clear-engo-import'){engoImportDraft='';pendingEngo=null;return render()}
if(ac==='cancel-engo-import'){pendingEngo=null;return render()}
if(ac==='preview-engo'){
 engoImportDraft=document.getElementById('engoBulk').value;
 try{pendingEngo=EngoCycles.parse(engoImportDraft,state.engoCycles||[])}
 catch(error){pendingEngo=null;return toast(error.message)}
 return render();
}
if(ac==='confirm-engo-import'){
 if(!pendingEngo)return toast('Najpierw sprawdź import.');
 const parsed=EngoCycles.parse(engoImportDraft,state.engoCycles||[]);
 if(!parsed.added)return toast('Wszystkie zdarzenia już istnieją.');
 if(!confirm('Dopisać '+parsed.added+' zdarzeń ENGO? Pominięte duplikaty: '+parsed.skipped+'.'))return;
 state.engoCycles=parsed.rows;
 changeLog('Import cykli ENGO','Dodano '+parsed.added+' zdarzeń (pominięto '+parsed.skipped+' duplikatów).');
 save();pendingEngo=null;engoImportDraft='';toast('Dopisano '+parsed.added+' zdarzeń ENGO.');return render();
}
if(ac==='edit-engo'){
 const id=btn.dataset.id;if(!(state.engoCycles||[]).some(r=>r.id===id))return toast('Nie znaleziono zdarzenia.');
 editingEngo=id;return render();
}
if(ac==='cancel-engo-edit'){editingEngo=null;return render()}
if(ac==='save-engo-edit'){
 const id=editingEngo,old=(state.engoCycles||[]).find(r=>r.id===id);
 if(!old)return toast('Nie znaleziono zdarzenia.');
 const raw=document.getElementById('engoEditAt').value,status=document.getElementById('engoEditStatus').value;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)||!['on','off'].includes(status))return toast('Wpisz prawidłowe zdarzenie.');
 let parsed;
 try{parsed=EngoCycles.parse(raw.slice(0,10)+';'+raw.slice(11)+';'+status.toUpperCase(),state.engoCycles.filter(r=>r.id!==id))}
 catch(error){return toast(error.message)}
 if(parsed.added!==1)return toast('Zdarzenie w tej minucie już istnieje.');
 const at=new Date(parsed.preview[0].at);
 if(old.at===at.toISOString()&&old.status===status){editingEngo=null;return render()}
 if(!confirm('Poprawić zdarzenie ENGO: '+day(old.at)+' → '+day(at.toISOString())+'?'))return;
 const index=state.engoCycles.findIndex(r=>r.id===id);
 state.engoCycles[index]={...old,at:at.toISOString(),status};
 changeLog('Poprawiono cykl ENGO',day(old.at)+' → '+day(at.toISOString())+' · '+status.toUpperCase());
 save();editingEngo=null;toast('Zapisano poprawkę ENGO.');return render();
}
if(ac==='delete-engo'){
 const id=btn.dataset.id,index=(state.engoCycles||[]).findIndex(r=>r.id===id);
 if(index<0)return toast('Nie znaleziono zdarzenia.');
 const row=state.engoCycles[index];
 if(!confirm('Usunąć zdarzenie '+day(row.at)+' ('+row.status.toUpperCase()+')? Może to zmienić statystyki cykli.'))return;
 state.engoCycles.splice(index,1);
 changeLog('Usunięto cykl ENGO',day(row.at)+' · '+row.status.toUpperCase());
 save();editingEngo=null;toast('Usunięto zdarzenie ENGO.');return render();
}
if(ac==='more-engo'){engoLimit+=120;return render()}

if(ac==='edit-boiler'){
 const id=btn.dataset.id;if(!(state.boilerReadings||[]).some(x=>x.id===id))return toast('Nie odnaleziono odczytu.');
 editingBoiler=id;return setPage('boiler');
}
if(ac==='cancel-boiler'){editingBoiler=null;return render()}
if(ac==='delete-boiler'){
 const id=btn.dataset.id,index=(state.boilerReadings||[]).findIndex(x=>x.id===id);
 if(index<0)return toast('Nie odnaleziono odczytu.');
 const r=state.boilerReadings[index];
 if(!confirm('Usunąć odczyt liczników BRÖTJE z '+day(r.at)+'? Zniknie z porównań.'))return;
 state.boilerReadings.splice(index,1);
 changeLog('Usunięto odczyt BRÖTJE',day(r.at)+' · AC001 '+r.ac001+' · AC005 '+r.ac005+' · AC006 '+r.ac006);
 editingBoiler=null;save();toast('Usunięto odczyt liczników.');return render();
}
if(ac==='save-boiler'){
 const inputs=['boilerAc001','boilerAc005','boilerAc006'].map(id=>numInput(id,0,100000000));
 if(inputs.some(x=>!x.ok))return;
 const vals=inputs.map(x=>x.value);
 if(vals.every(x=>x===null)||vals.some(x=>x!==null&&!Number.isSafeInteger(x)))return toast('Wpisz co najmniej jeden licznik, używając pełnych liczb całkowitych.');
 const d=document.getElementById('boilerAt').value,at=new Date(HeatingBoard.parseLocal(d));
 if(!Number.isFinite(at.valueOf())||at.valueOf()>Date.now()+3600000)return toast('Wpisz poprawną datę i godzinę zdjęcia.');
 const note=document.getElementById('boilerNote').value.trim().slice(0,200);
 const existing=editingBoiler?(state.boilerReadings||[]).find(x=>x.id===editingBoiler):null;
 if(editingBoiler&&!existing)return toast('Nie odnaleziono edytowanego odczytu.');
 if((state.boilerReadings||[]).some(x=>x.id!==editingBoiler&&Math.abs(Date.parse(x.at)-at.valueOf())<60000))
   return toast('Odczyt z tej samej minuty już istnieje. Popraw go zamiast dodawać duplikat.');
 const [ac001,ac005,ac006]=vals;
 if(existing&&existing.at===at.toISOString()&&existing.ac001===ac001&&existing.ac005===ac005&&existing.ac006===ac006&&existing.note===note){editingBoiler=null;return render()}
 if(!confirm((existing?'Poprawić':'Zapisać')+' liczniki BRÖTJE z '+day(at.toISOString())+'? AC001: '+ac001+', AC005: '+ac005+', AC006: '+ac006+'.'))return;
 const row={id:existing?.id||'b-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),at:at.toISOString(),ac001,ac005,ac006,note};
 if(existing){const idx=state.boilerReadings.findIndex(x=>x.id===existing.id);state.boilerReadings[idx]=row;}
 else state.boilerReadings.push(row);
 changeLog(existing?'Poprawiono liczniki BRÖTJE':'Odczyt liczników BRÖTJE',day(row.at)+' · AC001 '+ac001+' · AC005 '+ac005+' · AC006 '+ac006);
 editingBoiler=null;save();boardMessage='Zapisano liczniki BRÖTJE na urządzeniu.';
 if(page==='boiler-quick')return setPage('dashboard');
 toast(boardMessage);return render();
}
if(ac==='edit-gas'){
 const kind=btn.dataset.kind,index=Number(btn.dataset.index),list=kind==='condition'?state.conditions:kind==='history'?state.gasHistory:null;
 if(!list||!Number.isSafeInteger(index)||index<0||!list[index])return;
 editingGas={kind,index};return setPage('insights');
}
if(ac==='cancel-gas-edit'){editingGas=null;return render()}
if(ac==='delete-gas'){
 const kind=btn.dataset.kind,index=Number(btn.dataset.index),list=kind==='condition'?state.conditions:kind==='history'?state.gasHistory:null;
 if(!list||!Number.isSafeInteger(index)||index<0||!list[index])return;
 const old=list[index];if(!confirm('Usunąć odczyt '+fmt(old.gas,3)+' m³ z '+day(old.at)+'? Nie będzie uwzględniany w analizie.'))return;
 if(kind==='history')list.splice(index,1);else list[index].gas=null; // Weather observation remains.
 changeLog('Usunięto odczyt gazomierza',day(old.at)+' · '+fmt(old.gas,3)+' m³ · '+(kind==='condition'?'obserwacja pogody zachowana':old.meter));
 editingGas=null;save();lastGasId=null;boardMessage='Usunięto odczyt i przeliczono zużycie gazu.';
 maybeSyncGas();toast(boardMessage);return render();
}
if(ac==='save-gas-edit'){
 if(!editingGas)return;
 const {kind,index}=editingGas,list=kind==='condition'?state.conditions:state.gasHistory,old=list[index];
 if(!old)return toast('Nie odnaleziono wpisu.');
 const v=numInput('editGasValue',0,100000000,false);if(!v.ok)return;
 const limited=kind==='condition';
 const rawDate=limited?old.at:document.getElementById('editGasAt').value;
 const millis=limited?Date.parse(rawDate):HeatingBoard.parseLocal(rawDate);
 if(!Number.isFinite(millis)||millis>Date.now()+86400000)return toast('Nieprawidłowa data.');
 const d=new Date(millis).toISOString(),meter=limited?(old.meter||'new'):document.getElementById('editGasMeter').value;
 const source=limited?'pomiar':document.getElementById('editGasSource').value;
 if(!['new','old'].includes(meter)||(!limited&&!['manual','orlen'].includes(source)))return toast('Nieprawidłowe źródło.');
 if(Insights.readings(state).some(r=>!(r.kind===kind&&r.index===index)&&r.meter===meter&&Math.abs(r.at-millis)<30000&&Math.abs(r.gas-v.value)<.00001))return toast('Taki odczyt już istnieje.');
 if(old.gas===v.value&&old.at===d&&(limited||(old.meter===meter&&old.source===source))){editingGas=null;return render()}
 if(!confirm('Zatwierdzić poprawkę: '+fmt(old.gas,3)+' m³ → '+fmt(v.value,3)+' m³?'))return;
 const detail=day(old.at)+' · '+fmt(old.gas,3)+' m³ → '+day(d)+' · '+fmt(v.value,3)+' m³';
 list[index]={...old,at:d,gas:v.value,...(limited?{}:{meter,source})};
 changeLog('Poprawiono odczyt gazomierza',detail);editingGas=null;save();lastGasId=null;
 boardMessage='Zapisano poprawkę i przeliczono zużycie gazu.';maybeSyncGas();toast(boardMessage);return render();
}


if(ac==='gas-connect'){
 const token=document.getElementById('gasSyncToken')?.value.trim(),role=document.getElementById('gasSyncRole')?.value;
 if(document.getElementById('gasSyncToken'))document.getElementById('gasSyncToken').value='';
 GasSync.connect(role,token).then(()=>{render();toast('Połączono z prywatnym archiwum.')}).catch(gasSyncError);
 return;
}
if(ac==='gas-activate'){
 if(!confirm('Włączyć automatyczną archiwizację wszystkich lokalnych odczytów gazu w prywatnym GitHubie? Historia na iPhonie pozostanie bez zmian.'))return;
 GasSync.activate().then(()=>{render();maybeSyncGas()}).catch(gasSyncError);return;
}
if(ac==='gas-refresh')return GasSync.refresh().then(()=>{render();toast('Pobrano prywatną historię gazu.')}).catch(gasSyncError);
if(ac==='gas-sync-now'){
 const pending=maybeSyncGas();
 if(!pending)return;
 return pending.then(()=>toast(GasSync.status().message)).catch(gasSyncError);
}
if(ac==='gas-disconnect'){
 if(!confirm('Zapomnieć klucz tego urządzenia? Dane lokalne i prywatne archiwum GitHub zostaną zachowane.'))return;
 GasSync.disconnect().then(()=>{render();toast('Odłączono klucz. Dane zachowane.')}).catch(gasSyncError);return;
}

if(ac==='refresh-weather')return syncWeather(true);
if(ac==='refresh-setti')return syncSetti(true);
if(ac==='refresh-heads')return syncHeads(true);
if(ac==='open-room')return setPage('room',btn.dataset.room);
if(ac==='save-target'){let rid=btn.dataset.room,n=numInput('target',10,30);if(!n.ok)return;let old=state.rooms[rid].target;if(changed(old,n.value)){state.rooms[rid].target=n.value;changeLog('Cel: '+RM[rid].name,`${T(old)} → ${T(n.value)}`);save()}toast('Zapisano temperaturę docelową.');return render()}
if(ac==='save-radiators'){let rid=btn.dataset.room,updates=[];for(let k of RM[rid].rads){let n=numInput('rad-'+k,5,35);if(!n.ok)return;updates.push([k,n.value])}let desc=[];for(let [k,v] of updates){let old=state.radiators[k];if(changed(old,v)){state.radiators[k]=v;desc.push(`${k}: ${T(old)} → ${T(v)}`)}}if(desc.length){changeLog('Głowice: '+RM[rid].name,desc.join(' · '));save()}toast('Zapisano nastawy głowic.');return render()}
if(ac==='reading'){let rid=btn.dataset.room,n=numInput('tempReading',-10,45,false),h=numInput('humidityReading',0,100);if(!n.ok||!h.ok)return;let note=document.getElementById('readNote').value.slice(0,200);state.rooms[rid].readings.push({at:now(),temp:n.value,humidity:h.value,note});changeLog('Pomiar: '+RM[rid].name,`${T(n.value)}${h.value===null?'':' · '+fmt(h.value,0)+'%'}${note?' · '+note:''}`);save();toast('Zapisano pomiar Setti+.');return render()}
if(ac==='boiler-sync-connect'){
 const host=document.getElementById('boilerSyncHost').value,key=document.getElementById('boilerSyncKey').value;
 return Promise.resolve().then(()=>BoilerSync.connect(host,key)).then(note=>{applyBoilerNote(note);render();toast('Połączono z Home Assistant.');}).catch(error=>toast(error.message));
}
if(ac==='boiler-sync-refresh')return refreshBoiler(true);
if(ac==='set-boiler'){
 const n=numInput('boilerSet',25,85,false);if(!n.ok)return;
 if(!Number.isInteger(n.value))return toast('Wpisz pełne stopnie Celsjusza.');
 if(coSending)return toast('Poczekaj na potwierdzenie poprzedniej notatki.');
 if(!confirm('Zapisz odczytaną nastawę CO '+fmt(n.value,0)+'°C? To wpis do dziennika.'))return;
 const old=state.global.boiler;
 const row={id:recordId('co'),at:now(),value:n.value,source:'manual'};
 state.global.boiler=n.value;(state.coHistory??=[]).push(row);
 changeLog('Temperatura CO · ręczny wpis',fmt(old,0)+'°C → '+fmt(n.value,0)+'°C');save();
 coStatus=BoilerSync.status().paired?'Zapisano CO lokalnie. Oczekuje na potwierdzenie HA.':'Zapisano CO lokalnie.';
 if(page==='co-quick')setPage('dashboard');else render();
 sendCo(row);return;
}
if(ac==='boiler-send-local'){
 const row=lastCo();if(row?.source==='manual')return sendCo(row,true);
 return;
}
if(ac==='set-engo'){let a=numInput('engoSet',10,30,false),b=numInput('engoCurrent',0,45);if(!a.ok||!b.ok)return;let place=document.getElementById('engoPlace').value.trim().slice(0,220);let old=state.global;let details=[];if(changed(old.engo,a.value))details.push(`zadana: ${T(old.engo)} → ${T(a.value)}`);if(changed(old.engoCurrent,b.value))details.push(`odczyt: ${T(old.engoCurrent)} → ${T(b.value)}`);if(changed(old.engoPlace,place))details.push(`położenie: ${old.engoPlace} → ${place}`);if(details.length)changeLog('ENGO Smart',details.join(' · '));state.global={...old,engo:a.value,engoCurrent:b.value,engoPlace:place};save();toast('Zapisano ustawienia ENGO.');return render()}
if(ac==='record-conditions'){let b=numInput('gas',0,100000000);if(!b.ok)return;const near=Insights.near(state.weather?.hourly,Date.now());const outdoor=near?near.temp:null;const sky=document.getElementById('sky').value;if(b.value===null&&sky==='unknown'){toast('Wpisz stan licznika albo warunki.');return}let record={at:now(),outdoor,gas:b.value,sky,meter:'new'};if(b.value!==null){const snap=Setti.snapshot();if(snap)record.setti=snap;}if(b.value!==null&&!confirm('Zatwierdzić stan gazomierza '+fmt(b.value,3)+' m³?'))return;state.conditions.push(record);changeLog('Warunki zewnętrzne / gaz',`${outdoor===null?'Pogoda: brak danych':T(outdoor)} · ${b.value===null?'Brak stanu licznika':fmt(b.value,3)+' m³'} · ${record.sky}`);save();maybeSyncGas();toast('Zapisano odczyt. Pogoda jest pobierana automatycznie.');return render()}
if(ac==='add-gas'){
 const d=document.getElementById('gasAt').value,v=numInput('gasValue',0,100000000,false),meter=document.getElementById('gasMeter').value,source=document.getElementById('gasSource').value;
 if(!v.ok)return;const at=new Date(HeatingBoard.parseLocal(d));if(!Number.isFinite(at.valueOf())||at.valueOf()>Date.now()+86400000)return toast('Wpisz prawidłową datę.');
 if(!['old','new'].includes(meter)||!['manual','orlen'].includes(source))return toast('Sprawdź gazomierz i źródło.');
 const dup=Insights.readings(gasViewState()).some(r=>r.meter===meter&&Math.abs(r.at-at.valueOf())<30000&&Math.abs(r.gas-v.value)<.00001);
 if(dup)return toast('Ten odczyt już istnieje.');
 if(!confirm('Zatwierdzić odczyt '+fmt(v.value,3)+' m³ z '+day(at.toISOString())+'?'))return;
 const snap=source==='manual'&&Math.abs(at.valueOf()-Date.now())<=300000?Setti.snapshot():null;
 const row={id:recordId('g'),at:at.toISOString(),gas:v.value,meter,source,...(snap?{setti:snap}:{})};
 state.gasHistory.push(row);
 changeLog('Odczyt gazomierza',meter+' · '+fmt(v.value,3)+' m³ · '+d);save();
 lastGasId=row.id;
 const sync=GasSync.status();
 boardMessage='Zapisano odczyt lokalnie. '+(sync.active&&sync.role==='write'?'Oczekuje na prywatną synchronizację.':'Wysyłka tego urządzenia jest wyłączona.');
 if(page==='gas-quick')setPage('home');else render();
 maybeSyncGas();toast('Zapisano odczyt lokalnie.');return;
}
if(ac==='bulk-gas'){
 const parsed=Insights.importRows(document.getElementById('gasBulk').value,state.gasHistory);
 if(!parsed.added)return toast('Wszystkie odczyty już istnieją.');
 state.gasHistory=parsed.rows;changeLog('Import historii ORLEN','Dodano '+parsed.added+' odczytów gazu.');save();maybeSyncGas();toast('Dodano '+parsed.added+' odczytów bez usuwania starych.');return render();
}
if(ac==='add-engo-history'){
 const d=document.getElementById('engoAt').value,v=numInput('engoHistoryValue',10,30,false);
 if(!v.ok)return;const at=new Date(HeatingBoard.parseLocal(d));if(!Number.isFinite(at.valueOf())||at.valueOf()>Date.now()+86400000)return toast('Wpisz prawidłową datę.');
 const note=document.getElementById('engoHistoryNote').value.trim().slice(0,300);
 if(state.heatingEvents.some(e=>e.at===at.toISOString()&&e.engo===v.value))return toast('Taka zmiana już istnieje.');
 state.heatingEvents.push({id:'e-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),at:at.toISOString(),engo:v.value,note});
 changeLog('Historyczna zmiana ENGO',day(at.toISOString())+' · '+T(v.value)+' · '+note);save();toast('Zapisano historię ENGO.');return render();
}
if(ac==='start-exp'){if(state.experiments.some(x=>x.status==='active'))return toast('Zakończ poprzedni eksperyment.');let title=document.getElementById('expTitle').value.trim().slice(0,100),description=document.getElementById('expDescription').value.trim().slice(0,1500);if(!title)return toast('Nadaj nazwę eksperymentowi.');let x={id:Date.now().toString(36),status:'active',title,description,started:now(),start:snapshot(),notes:null};state.experiments.unshift(x);changeLog('Rozpoczęto eksperyment',title);save();toast('Rozpoczęto eksperyment. Ustawienia początkowe zapisane.');return render()}
if(ac==='finish-exp'){let x=state.experiments.find(x=>x.id===btn.dataset.id&&x.status==='active');if(!x)return;x.end=snapshot();x.ended=now();x.notes=document.getElementById('finishNotes').value.trim().slice(0,3000);x.status='done';changeLog('Zakończono eksperyment',x.title+(x.notes?' · '+x.notes:''));save();toast('Zakończono eksperyment i zapisano migawkę końcową.');return render()}
if(ac==='more-history'){historyLimit+=120;return render()}
if(ac==='persist'){navigator.storage?.persist?.().then(ok=>toast(ok?'Przeglądarka przyznała trwały zapis. Nadal twórz kopie JSON.':'Przeglądarka nie przyznała ochrony. Zapisuj kopie JSON.')).catch(()=>toast('Ochrona zapisu niedostępna. Zapisz kopię JSON.'));return}
if(ac==='recover'){if(confirm('Przywrócić poprzedni lokalny zapis? Bieżące dane zostaną zastąpione.')){GasSync.pause(true);state=DataStore.recover();setPage('home');refreshBoiler();toast('Przywrócono poprzedni zapis. Wysyłanie gazu wstrzymane do ponownej decyzji.')}return}
if(ac==='map-import')return document.getElementById('mapFile').click();
if(ac==='map-download'){const mime=state.privateMap.split(';')[0].slice(5);const bytes=Uint8Array.from(atob(state.privateMap.split(',')[1]),c=>c.charCodeAt(0));return downloadBlob('moja-prywatna-mapa.'+(mime==='image/svg+xml'?'svg':mime==='image/png'?'png':'jpg'),new Blob([bytes],{type:mime}))}
if(ac==='export-json')return exportJson();if(ac==='export-csv')return exportCsv();if(ac==='import-json')return document.getElementById('importFile').click();
if(ac==='reset'){if(confirm('Czy na pewno skasować wszystkie lokalne nastawy, pomiary i eksperymenty? Najpierw pobierz kopię JSON.')){GasSync.pause(true);state=seed();save();setPage('home');toast('Wyczyszczono dane lokalne. Prywatne archiwum bez zmian.')}}}

function analysisSources(){
 const st=Setti.status(),hs=Heads.status();
 return {setti:{data:Setti.snapshot()||null,fresh:st.ok,at:st.at},
   heads:{data:Heads.lastSnapshot(),fresh:hs.ok,at:hs.at}};
}
function exportAnalysisReport(){
 const report=MemoryKit.augment(HeatingReview.build(state,reviewPeriod,analysisSources()),state);
 const label=report.period.end.slice(0,10);
 downloadText('moje-ogrzewanie-pamiec-i-analiza-'+reviewPeriod+'-'+label+'.json',
   JSON.stringify(report,null,2),'application/json;charset=utf-8');
 toast('Pakiet pamięci i pomiarów przygotowany. Przejrzyj plik przed wysłaniem do ChatGPT.');
}

function snapshot(){return {boiler:state.global.boiler,engo:state.global.engo,engoPlace:state.global.engoPlace,radiators:{...state.radiators},doors:{...state.doors},targets:Object.fromEntries(ROOMS.map(r=>[r.id,state.rooms[r.id].target])),measurements:Object.fromEntries(ROOMS.map(r=>[r.id,last(r.id)?.temp??null]))}}
function downloadText(name,body,mime){return downloadBlob(name,new Blob([body],{type:mime}));}
function downloadBlob(name,blob){let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function exportJson(){downloadText('moje-ogrzewanie-kopia-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json;charset=utf-8');toast('Przygotowano kopię JSON. Zachowaj ją poza przeglądarką.')}
function csvCell(x){if(typeof x==='string'&&/^[=+@\-\t\r]/.test(x))x="'"+x;return '"'+String(x??'').replace(/"/g,'""')+'"'}
function exportCsv(){let out=[['data','pomieszczenie','czujnik','temperatura_C','wilgotnosc_proc','uwagi']];for(let r of ROOMS){for(let m of state.rooms[r.id].readings){out.push([m.at,r.name,r.sensor,m.temp,m.humidity,m.note])}}out= [out[0],...out.slice(1).sort((a,b)=>a[0].localeCompare(b[0]))];downloadText('moje-ogrzewanie-pomiary.csv','\ufeff'+out.map(row=>row.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');toast('Przygotowano CSV z pomiarami.')}
function guarded(fn){return (...args)=>{try{return fn(...args)}catch(error){state=DataStore.current(seed);document.getElementById('storageAlert').hidden=false;document.getElementById('storageAlert').textContent=error.message;toast(error.message)}}}
document.addEventListener('click',guarded(handleClick));
document.addEventListener('input',e=>{
 if(['gasValue','gasAt','gasMeter'].includes(e.target?.id))updateGasPreview();
 if(['boilerAt','boilerAc001','boilerAc005','boilerAc006'].includes(e.target?.id))updateCounterPreview();
 if(e.target?.id==='engoBulk'){engoImportDraft=e.target.value;pendingEngo=null}if(e.target?.id==='tempBulk'){tempImportDraft=e.target.value;tempPreview=null}if(e.target?.id==='memoryBulk'){memoryImportDraft=e.target.value;memoryPreview=null}});
document.addEventListener('change',guarded(e=>{let el=e.target;if(['gasMeter','gasAt'].includes(el.id))updateGasPreview();
 if(el.id==='boilerAt')updateCounterPreview();
 if(el.dataset.change==='air-window'){
  if(HeatingBoard.windows.includes(el.value)){if(el.checked)airChoice.add(el.value);else airChoice.delete(el.value);}
  const control=document.querySelector?.('[data-action="air-start"]');if(control)control.disabled=!airChoice.size;
  return;
 }
 if(el.dataset.change==='air-opening'){airOpening=HeatingBoard.openings.includes(el.value)?el.value:'';return;}
 if(el.dataset.change==='review-period'){reviewPeriod=el.value;return render()}if(el.dataset.change==='temp-day'){tempDay=el.value;return render()}if(el.dataset.change==='door'){let id=el.dataset.id,old=state.doors[id];if(old!==el.value){state.doors[id]=el.value;changeLog('Drzwi: '+DOORS[id].name,`${DOORSTATUS[old]} → ${DOORSTATUS[el.value]}`);save();toast('Zapisano położenie drzwi.') }}if(el.dataset.change==='electric'){let old=state.global.electric;let next=el.value||null;state.global.electric=next;if(old!==next){changeLog('Grzejnik elektryczny GE1',`${old||'nie zapisano'} → ${next||'nie zapisano'}`);save();toast('Zapisano stan konwektora.')}}}));


document.getElementById('memoryFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
   if(file.size>50000)throw Error('Plik wniosków jest za duży (limit 50 KB).');
   const raw=await file.text();
   memoryPreview=MemoryKit.parseProposal(raw,state.knowledgeLog||[],state.experiments||[]);
   memoryImportDraft=raw;setPage('memory');
 }catch(error){alert('Nie udało się odczytać propozycji: '+error.message)}
 finally{e.target.value=''}
});

document.getElementById('tempFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>700000)throw Error('Plik jest za duży (maksymalnie 700 KB).');
  const raw=await file.text();
  const parsed=TemperatureHistory.parse(raw,state.temperatureHistory||[]);
  tempImportDraft=raw;tempPreview=parsed;setPage('temperatures');
 }catch(error){alert('Nie udało się wczytać historii Home Assistant: '+error.message)}
 finally{e.target.value=''}
});

document.getElementById('engoFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>90000)throw Error('Plik ENGO jest za duży (maksymalnie 90 KB).');
  const raw=await file.text();
  const parsed=EngoCycles.parse(raw,state.engoCycles||[]);
  engoImportDraft=raw;pendingEngo=parsed;setPage('engo-cycles');
 }catch(error){alert('Nie udało się odczytać pliku ENGO: '+error.message)}
 finally{e.target.value=''}
});

document.getElementById('importFile').addEventListener('change',async e=>{let f=e.target.files[0];if(!f)return;try{if(f.size>20*1024*1024)throw Error('Kopia jest za duża (limit 20 MB).');let p=DataStore.validate(JSON.parse(await f.text()));if(confirm('Wczytać kopię i zastąpić bieżące dane? Poprzedni poprawny zapis pozostanie lokalną kopią odzyskiwania.')){GasSync.pause(true);DataStore.replace(p);state=p;setPage('home');document.getElementById('storageAlert').hidden=true;toast('Wczytano kopię JSON.')}}catch(ex){alert('Nie udało się wczytać kopii: '+ex.message)}finally{e.target.value=''}});
document.getElementById('mapFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error('Mapa może mieć najwyżej 2 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f)});const next=DataStore.validate({...state,privateMap:data});DataStore.save(next);state=next;render();toast('Prywatna mapa zapisana lokalnie.')}catch(ex){alert('Nie udało się zapisać mapy: '+ex.message)}finally{e.target.value=''}});
async function syncSetti(force=false){
 const ok=typeof fetch==='function'&&navigator.onLine!==false?await Setti.refresh(fetch):false;
 renderGasWhenIdle();
 if(force)toast(ok?'Pobrano aktualne pomiary Setti+.':'Brak aktualnych pomiarów Setti+. Możesz nadal zapisywać ręcznie.');
}
async function syncHeads(force=false){
 const ok=typeof fetch==='function'&&navigator.onLine!==false?await Heads.refresh(fetch):false;
 renderGasWhenIdle();
 if(force)toast(ok?'Pobrano aktualne dane głowic.':'Nie uzyskano aktualnych danych głowic. Ostatni zapis jest oznaczony czasem synchronizacji.');
}
async function syncHa(force=false,pass=null){
 if(typeof fetch!=='function'||navigator.onLine===false){
  haSyncLabel='Brak internetu — używamy zapisanej historii lokalnej.';
  if(force)toast(haSyncLabel);
  return;
 }
 try{
  const payload=pass!==null?await HaSync.unlock(pass,fetch):await HaSync.refresh(fetch);
  if(payload.locked){
   haUnlocked=false;haSyncLabel='Oczekuje na hasło archiwum. Historia lokalna jest bezpieczna.';
   if(force)toast('Najpierw wpisz hasło prywatnego archiwum.');
  }else{
   haUnlocked=true;
   if(payload.dashboard)haSnapshot=payload.dashboard;
   const merged=HaSync.merge(payload,state.engoCycles||[],state.temperatureHistory||[]);
   if(merged.addedEngo||merged.addedTemps){
    const next=DataStore.validate({...state,engoCycles:merged.engos,temperatureHistory:merged.temps});
    DataStore.save(next);state=next;
   }
   haSyncLabel=(payload.dashboardError?'Migawka urządzeń jest nieprawidłowa. ':'')+'Odczyt HA z '+day(payload.generatedAt)+' · nowe ENGO: '+merged.addedEngo+
    ', temperatury: '+merged.addedTemps+'. Wszystkie dane zachowane lokalnie.';
   if(force)toast('Synchronizacja zakończona. Nowe ENGO: '+merged.addedEngo+', temperatury: '+merged.addedTemps+'.');
  }
 }catch(error){
  haSyncLabel='Synchronizacja HA niedostępna: '+error.message+'. Dotychczasowa historia nie została zmieniona.';
  if(force)toast(haSyncLabel);
 }
 renderGasWhenIdle();
}
window.addEventListener('load',()=>{
 if(typeof HeatingPreview!=='undefined'){HeatingPreview.start();return;}
 syncWeather();syncSetti();syncHeads();syncHa();gasSyncOnLoad();refreshBoiler();if(typeof window.setInterval==='function')window.setInterval(()=>{refreshBoiler();syncSetti();syncHeads();syncHa();if(GasSync.isConnected()){if(GasSync.status().role==='write'&&GasSync.status().active)maybeSyncGas();else GasSync.refresh().then(renderGasWhenIdle).catch(()=>{})}},5*60*1000)});
window.addEventListener('pageshow',()=>{if(typeof HeatingPreview==='undefined')syncWeather();});
document.addEventListener('visibilitychange',()=>{if(typeof HeatingPreview==='undefined'&&document.visibilityState==='visible'){syncWeather();refreshBoiler();syncHa();}});
if(typeof window.setInterval==='function')window.setInterval(()=>{
 const active=(state.ventilation||[]).find(row=>!row.ended);
 if(active)document.querySelectorAll('[data-air-clock]').forEach(node=>{node.textContent=HeatingBoard.elapsed(Date.now()-Date.parse(active.started));});
},1000);
window.addEventListener('online',()=>{if(typeof HeatingPreview==='undefined'){syncWeather();refreshBoiler();}maybeSyncGas();});
window.addEventListener('storage',e=>{if(DataStore.isKey(e.key)){document.getElementById('storageAlert').hidden=false;document.getElementById('storageAlert').textContent='Dane zmieniono w innej karcie. Odśwież aplikację przed kolejnym zapisem.'}});

render();
if(DataStore.warning){document.getElementById('storageAlert').hidden=false;document.getElementById('storageAlert').textContent=DataStore.warning}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>{reg.update();reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)toast('Nowa wersja gotowa. Zamknij wszystkie karty aplikacji i otwórz ją ponownie.')})})}).catch(()=>toast('Tryb offline jest niedostępny. Sprawdź połączenie i otwórz aplikację ponownie.')));
}
