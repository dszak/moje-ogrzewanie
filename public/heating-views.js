'use strict';

const HeatingViews = (() => {
  const button=(label,page)=>`<button class="action light" data-action="page" data-page="${page}">${label}</button>`;
  const back=(label,page='home')=>`<button class="back" data-action="page" data-page="${page}">${label}</button>`;
  const formatGas=value=>fmt(value,3)+' m³';
  const litres=m3=>count(Math.round(m3*1000));
  const timestamp=at=>HeatingBoard.when(at);
  const interval=x=>timestamp(x.start)+' – '+timestamp(x.end);
  const source=(text,at)=>`<p class="hint">${esc(text)}${at?' · '+timestamp(at):''}</p>`;
  const metric=(label,value,hint='')=>`<div><span>${label}</span><strong>${value}</strong>${hint?'<small>'+hint+'</small>':''}</div>`;

  function gasSummary(model,full=false) {
    const {latest,last,rolling,comparison}=model.gas;
    const period=last?esc(interval(last)):'';
    const text=comparison?'<p class="hint">Poprzedni okres '+esc(interval(comparison.previous))+
      ' · '+(comparison.weather?'podobny czas i średnia pogoda':'podobny czas, bez oceny pogody')+
      ' · '+(comparison.percent===0?'tempo bez zmian':fmt(Math.abs(comparison.percent),1)+'% '+(comparison.percent<0?'mniej':'więcej'))+'.</p>':'';
    return `<section class="card board-gas" aria-label="Zużycie gazu"><div class="group-heading"><h3>Gaz</h3>
      <span class="small muted">${latest?(latest.meter==='old'?'Stary':'Obecny')+' gazomierz':'Brak odczytów'}</span></div>
      ${latest?`<p class="hint">Ostatni odczyt <strong>${formatGas(latest.gas)}</strong> · ${timestamp(latest.at)}</p>`:''}
      ${last?`<div class="board-metrics">${metric('Zużycie w ostatnim przedziale',litres(last.gas)+' l',formatGas(last.gas))}
      ${metric('Tempo w tym przedziale',litres(last.perDay)+' l/dobę',HeatingBoard.elapsed(last.end-last.start)+' między odczytami')}</div><p class="hint">${period}</p>`
      :'<p>Brak danych o zużyciu między ostatnimi odczytami.</p>'}
      <div class="board-metrics">${rolling.map(w=>metric('Ostatnie '+w.days+' dni',w.perDay===null?'Brak danych':litres(w.perDay)+' l/dobę',
      'Pokrycie '+fmt(w.covered,1)+' z '+w.days+' dni'+(w.covered&&w.covered<w.days?' · średnia z pokrytych przedziałów':''))).join('')}</div>
      ${text}${full&&!comparison?'<p class="hint">Brak poprzedniego bezpośredniego przedziału o podobnej długości, spełniającego warunki porównania.</p>':''}
      ${full?'<p class="hint">Pokrycie wyliczamy z pełnych przedziałów ostatniego gazomierza mieszczących się w oknie. Nie interpolujemy jego granic. Tempo w l/dobę opisuje przedział, a nie chwilowe spalanie.</p>'+button('Historia i analizy gazu','insights'):''}
      </section>`;
  }

  function sensor(r) {
    return `<button class="board-room" data-action="open-room" data-room="${r.id}"><span>${r.name}</span>
       <strong>${T(r.display?.temp)}</strong><small>${esc(r.label)}${r.display?.at?' · '+timestamp(r.display.at):''}</small></button>`;
  }

  function engo(model,full) {
    const {demand,measured,target,temperatureSource,engoAt}=model;
    return `<section class="card" aria-label="ENGO"><div class="group-heading"><h3>ENGO</h3>
       <span class="pill">${demand?.status.toUpperCase()||'Brak danych'}</span></div>
       ${source(demand?'Ostatnie znane żądanie · '+demand.source:'Brak potwierdzonego żądania',demand?.at)}
       <div class="board-metrics">${metric('Temperatura ENGO zadana',T(target))}
       ${metric('Zmierzona przez ENGO',T(measured),Number.isFinite(measured)&&Number.isFinite(target)?'Zmierzona − zadana '+fmt(measured-target)+'°C':'')}</div>
       ${source(temperatureSource+(engoAt&&!HeatingBoard.fresh(engoAt,model.now)?' · odczyt nieaktualny':''),engoAt)}
       ${full?'<p class="hint">Żądanie termostatu nie potwierdza pracy palnika.</p>'+button('Historia i cykle ENGO','engo-cycles'):''}</section>`;
  }

  function boiler(model,full) {
    return `<section class="card"><h3>Kocioł BRÖTJE</h3>
       <p>Zapisana temperatura CO <strong>${T(model.co.value)}</strong></p>
       ${source(model.co.at?boilerMode():'Zapisana wartość · brak daty w starszym dzienniku',model.co.at)}
       ${full?`<div class="board-metrics board-counters">${model.counters.map(row=>metric(row.key.toUpperCase(),counterValue(row),
          row.at?timestamp(row.at)+' · '+gainLabel(row):'Brak odczytu')).join('')}</div><div class="actions">${button('Historia temperatury CO','co-quick')}${button('Historia liczników','boiler')}</div>`:''}</section>`;
  }

  function temperatures(model) {
    const weather=model.weather;
    return `<section class="card"><h3>Temperatury</h3><div class="board-metrics">
       ${metric('Średnia mieszkania',T(model.mean),model.count+' z 6 aktualnych czujników')}
       ${metric('Na zewnątrz',T(weather?.temp),weather?'Open-Meteo · '+timestamp(weather.at*1000):'Open-Meteo · brak aktualnej temperatury')}
       </div>${source('Setti+ · ostatnia synchronizacja',model.roomsAt)}</section>`;
  }

  function active(model,state) {
    const parts=[];
    if(model.air)parts.push(`<section class="board-active"><strong>Wietrzenie trwa</strong><p>${model.air.windows.join(' + ')}
      · od ${timestamp(model.air.started)} · <span data-air-clock>${esc(HeatingBoard.elapsed(model.now-Date.parse(model.air.started)))}</span></p>
      ${button('Wietrzenie','air')}</section>`);
    const experiment=state.experiments.find(x=>x.status==='active');
    if(experiment)parts.push(`<section class="board-active"><strong>Eksperyment · ${esc(experiment.title)}</strong>
      <p>${timestamp(experiment.started)}${experiment.description?' · '+esc(experiment.description):''}</p>${button('Otwórz eksperyment','experiments')}</section>`);
    return parts.join('');
  }

  function dashboard(model,state,full=false,message='') {
    const quick=`<section aria-label="Szybkie wpisy"><h3>Szybkie wpisy</h3>
      <div class="quick-writes">
      <button class="action" data-action="page" data-page="gas-quick">Gazomierz</button>
      ${button('Wietrzenie','air')}${button('Temperatura CO','co-quick')}${button('Liczniki kotła','boiler-quick')}
      </div></section>`;
    const byId=new Map(model.rooms.map(r=>[r.id,r]));
    const featured=['salon','bedroom'].map(id=>sensor(byId.get(id))).join('');
    const other=['kitchen','bigbath','smallbath','hall'].map(id=>sensor(byId.get(id))).join('');
    return `${full?back('Wróć do Startu'):''}${sec(full?'Pełna tablica ogrzewania':'Start','')}
       ${full?'':quick}${message?`<p class="board-feedback" role="status">${esc(message)}</p>`:''}
       ${active(model,state)}
       <div class="group-heading"><h3>Tablica ogrzewania</h3>${full?'':button('Pełna tablica ogrzewania','dashboard')}</div>
       <div class="board-grid">${engo(model,full)}${temperatures(model)}${gasSummary(model,full)}${boiler(model,full)}</div>
       <h3>Pomieszczenia</h3><div class="board-room-list featured-rooms">${featured}</div>
       <div class="board-room-list">${other}</div>
       ${full?'<h3>Urządzenia w łazienkach</h3><div class="board-grid">'+bath(model.snapshot,model.now,false)+
         Object.keys(Dehumidifiers.rooms).map(id=>dehumidifier(id,model.bathroomTelemetry,model.snapshot,
          byId.get(id)?.label.startsWith('Setti+')?byId.get(id).display:null,model.now)).join('')+'</div>':''}
       <p class="small muted"><strong>Dobrze gospodarować powierzonym mi dobrem.</strong> ${button('Pamięć projektu','memory')}</p>`;
  }

  function rooms(model) {
    return sec('Pomieszczenia','Pomiary pokojowe, cele komfortu i dane głowic.')+
      '<div class="board-room-list">'+model.rooms.map(sensor).join('')+'</div><div class="actions">'+
      button('Porównaj wszystkie głowice','heads')+
      '<button class="action ghost" data-action="refresh-setti">Odśwież czujniki</button></div>';
  }

  function menu(title,description,items) {
    return sec(title,description)+'<div class="section-menu">'+items.map(([label,detail,page])=>
      `<button data-action="page" data-page="${page}"><strong>${label}</strong><span>${detail}</span></button>`).join('')+'</div>';
  }

  function analysis() {
    return menu('Analizy','Wyniki, porównania i dziennik.',[
      ['Pełna tablica ogrzewania','Temperatury, gaz, ENGO i kocioł','dashboard'],
      ['Wykresy temperatur','Porównania pokoi i cykle ENGO','temperatures'],
      ['Osuszacze Equation','Wilgotność, zasilanie i energia obu łazienek','dehumidifiers'],
      ['Gaz i pogoda','Odczyty, porównania, korekty i import ORLEN','insights'],
      ['Cykle ENGO','Zdarzenia, statystyki i import','engo-cycles'],
      ['Eksperymenty','Aktywna próba, wyniki i wnioski','experiments'],
      ['Raport i decyzje','WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ','review'],
      ['Dziennik zmian','Wpisy i eksporty','history'],
      ['Wietrzenie','Zdarzenia i korekty','air']
    ]);
  }

  function more() {
    return menu('Więcej','Ustawienia, dokumentacja i kopie.',[
      ['Ustawienia i kopie zapasowe','BRÖTJE, ENGO, eksport JSON i CSV, odzyskiwanie','settings'],
      ['Liczniki BRÖTJE','Odczyty techniczne i korekty','boiler'],
      ['Dane i połączenia','Prywatne archiwum gazu, szyfrowany dostęp HA i diagnostyka','connections'],
      ['Pamięć projektu','Zasady, zatwierdzone ustalenia i dokumentacja','memory'],
      ['Prywatna mapa','Mapa przechowywana na tym urządzeniu','map'],
      ['Zaawansowany dziennik ręczny','Obserwacje i awaryjne zapisy','legacy']
    ]);
  }

  function gasForm(quick=false) {
    return `${quick?back('Wróć do Startu')+sec('Wpisz gazomierz',''):''}<section class="card quick-form" aria-label="Zapis gazomierza">
       ${quick?'':'<h3>Dodaj stan gazomierza</h3>'}<p id="gasPrevious" class="hint"></p>
       <label for="gasValue">Wskazanie (m³)</label><input type="text" id="gasValue" inputmode="decimal" autocomplete="off" placeholder="np. 125,400">
       <p id="gasDifference" class="hint" aria-live="polite"></p>
       <details ${quick?'':'open'}><summary>Data, gazomierz i źródło</summary>
       <label for="gasAt">Data i godzina (Europe/Warsaw)</label><input type="datetime-local" id="gasAt" value="${dateLocal(Date.now())}">
       <label for="gasMeter">Gazomierz</label><select id="gasMeter"><option value="new">Obecny</option><option value="old">Stary</option></select>
       <label for="gasSource">Źródło</label><select id="gasSource"><option value="manual">Mój odczyt</option><option value="orlen">ORLEN</option></select></details>
       <div class="actions"><button class="action" data-action="add-gas">Zapisz odczyt</button>${quick?button('Historia i korekty','insights'):''}</div>
       <p class="hint">Zapis lokalny aktualizuje tablicę od razu. Stan synchronizacji pojawi się przy potwierdzeniu.</p>
       </section>`;
  }

  const countId={ac001:'boilerAc001',ac005:'boilerAc005',ac006:'boilerAc006'};
  function counterValue(row) {return row.latest===null?'—':count(row.latest)+(row.key==='ac001'?' h':'');}
  function gainLabel(row) {
    return row.gain===null?(row.reset?'Spadek lub reset · brak przyrostu':'Brak poprzedniego odczytu')
      :'Przyrost '+count(row.gain)+(row.key==='ac001'?' h':'');
  }
  function boilerForm(readings,changing=null,quick=false) {
    const at=changing?Date.parse(changing.at):Date.now();
    const prior=HeatingBoard.counters(readings,at,changing?.id);
    return `${quick?back('Wróć do Startu')+sec('Liczniki BRÖTJE','Ręczne wskazania z kotła.'):''}
      <section class="card quick-form"><h3>${changing?'Popraw odczyt liczników':'Dodaj odczyt liczników'}</h3>
      <p class="hint">Możesz wpisać od jednego do trzech liczników. Puste pole nie jest odczytem.</p>
      ${prior.map(row=>`<div class="counter-field"><label for="${countId[row.key]}">${row.key.toUpperCase()} · ${HeatingBoard.names[row.key]}</label>
         <p class="hint" id="previous-${row.key}">${counterValue(row)} · ${timestamp(row.at)}</p>
         <input id="${countId[row.key]}" type="number" inputmode="numeric" min="0" max="100000000" step="1" value="${changing?.[row.key]??''}">
         <p class="hint" id="gain-${row.key}" aria-live="polite"></p></div>`).join('')}
      <details ${changing?'open':''}><summary>Data i komentarz</summary>
      <label for="boilerAt">Data i godzina odczytu (Europe/Warsaw)</label><input id="boilerAt" type="datetime-local" value="${dateLocal(at)}">
      <label for="boilerNote">Komentarz · opcjonalnie</label><input id="boilerNote" maxlength="200" value="${esc(changing?.note||'')}"></details>
      <div class="actions"><button class="action" data-action="save-boiler">Zapisz odczyt</button>
      ${changing?'<button class="action ghost" data-action="cancel-boiler">Anuluj</button>':''}
      ${quick?button('Historia liczników','boiler'):''}</div></section>`;
  }

  function coForm(state,message='') {
    const history=(state.coHistory||[]).slice().reverse();
    return back('Wróć do Startu')+sec('Temperatura CO','Ręczna notatka o ustawieniu na kotle BRÖTJE.')+
      `<section class="card quick-form"><p>Ostatnia zapisana wartość <strong>${T(state.global.boiler)}</strong></p>
      ${source(history.length?boilerMode():'Starszy zapis bez daty',history[0]?.at)}
      <label for="boilerSet">Temperatura zadana CO (°C)</label>${tempInput('boilerSet',state.global.boiler,25,85,1)}
      <div class="actions"><button class="action" data-action="set-boiler">Zapisz odczytaną nastawę</button></div>
      <p class="hint" role="status" data-co-status>${esc(message)}</p>
      ${boilerSyncSettings()}</section>
      <section class="card"><h3>Historia temperatury CO</h3>${history.length?history.map(row=>
      `<p class="item"><strong>${T(row.value)}</strong> · ${timestamp(row.at)} · ${row.source==='manual'?'Wpis ręczny':'Notatka z Home Assistant'}</p>`).join(''):'<p class="hint">Brak datowanych wpisów.</p>'}</section>`;
  }

  function air(state,chosen,opening,editing) {
    const events=state.ventilation||[];
    const active=events.find(row=>!row.ended);
    const entry=editing?events.find(row=>row.id===editing):null;
    const correction=entry?`<section class="card quick-form"><h3>Popraw zakończenie</h3><p>START · ${timestamp(entry.started)}</p>
       <label for="airEnd">Data i godzina zakończenia (Europe/Warsaw)</label>
       <input id="airEnd" type="datetime-local" step="1" value="${HeatingBoard.local(Date.parse(entry.ended||now()),true)}">
       <label for="airOffset">Przy niejednoznacznej godzinie zimowej/letniej</label>
       <select id="airOffset"><option value="">Automatycznie</option><option value="+02:00">Pierwsza godzina · UTC+02</option><option value="+01:00">Druga godzina · UTC+01</option></select>
       <div class="actions"><button class="action" data-action="air-correct">Zapisz poprawkę</button><button class="action ghost" data-action="air-cancel">Anuluj</button></div></section>`:'';
    return `${back('Wróć do Startu')}${sec('Wietrzenie','Ręczny zapis zdarzeń.')}
      ${active?`<section class="card board-active"><h3>Wietrzenie trwa <span data-air-clock>${esc(HeatingBoard.elapsed(Date.now()-Date.parse(active.started)))}</span></h3>
      <p>${active.windows.join(' + ')} · od ${timestamp(active.started)}${active.opening?' · '+active.opening:''}</p>
      <div class="actions"><button class="action" data-action="air-stop">STOP</button><button class="action ghost" data-action="air-edit" data-id="${esc(active.id)}">Wpisz wcześniejszy koniec</button></div></section>`:
      `<section class="card quick-form"><fieldset><legend>Wybierz grzejniki, nad którymi otwierasz okna</legend>
      <div class="actions"><button class="action light" data-action="air-preset" data-set="G3 G5">G3 + G5</button>
      <button class="action light" data-action="air-preset" data-set="G3 G5 G6">G3 + G5 + G6</button></div>
      <div class="air-windows">${HeatingBoard.windows.map(key=>
      `<label><input type="checkbox" data-change="air-window" value="${key}" ${chosen.has(key)?'checked':''}> ${key}</label>`).join('')}</div></fieldset>
      <label for="airOpening">Sposób otwarcia · opcjonalnie</label><select id="airOpening" data-change="air-opening">${HeatingBoard.openings.map(x=>
      `<option value="${x}" ${x===opening?'selected':''}>${x||'Bez opisu'}</option>`).join('')}</select>
      <button class="action" data-action="air-start" ${chosen.size?'':'disabled'}>START</button>
      <p class="hint">Moskitiery są wyposażeniem. Otwarcie odnotowujesz ręcznie.</p></section>`}
      ${correction}
      <section class="card"><h3>Historia wietrzenia</h3><p class="hint">Zapis na tym urządzeniu i w kopii JSON.</p>${events.filter(row=>row.ended).slice().reverse().map(row=>
      `<div class="item"><strong>${row.windows.join(' + ')} · ${esc(HeatingBoard.elapsed(Date.parse(row.ended)-Date.parse(row.started)))}</strong>
      <p class="hint">${timestamp(row.started)} – ${timestamp(row.ended)}${row.opening?' · '+row.opening:''}${row.corrections.length?' · skorygowano':''}</p>
      <button class="action ghost" data-action="air-edit" data-id="${esc(row.id)}">Popraw koniec</button></div>`).join('')||'<p class="hint">Brak zakończonych zdarzeń.</p>'}</section>`;
  }

  function comfort(state,room) {
    const entries=(state.comfort||[]).filter(row=>row.room===room).slice().reverse();
    return `<section class="card"><h3>Komfort odczuwalny</h3>
      <p class="hint">${entries.length?'Ostatnio '+entries[0].score+' z 5 · '+timestamp(entries[0].at):'Brak ocen dla tego pomieszczenia.'}</p>
      <label for="comfortNote">Komentarz · opcjonalnie</label><input id="comfortNote" maxlength="200">
      <div class="score" aria-label="Zapisz ocenę w skali 1–5">${[1,2,3,4,5].map(n=>
      `<button class="action light" aria-label="Zapisz ocenę ${n} z 5" data-action="comfort" data-score="${n}">${n}</button>`).join('')}</div>
      ${entries.length?`<details><summary>Historia ocen (${entries.length})</summary>${entries.map(x=>`<p>${x.score} z 5 · ${timestamp(x.at)}${x.note?' · '+esc(x.note):''}</p>`).join('')}</details>`:''}</section>`;
  }

  function bath(snapshot,nowMs) {
    const bath=snapshot?.bath;
    const labels=new Map([['on','ON'],['off','OFF'],['low','Niska moc'],['high','Wysoka moc'],['auto','Auto']]);
    const value=(entry,unit='')=>entry&&entry.value!==null
      ?typeof entry.value==='number'?fmt(entry.value)+unit:esc(labels.get(entry.value.toLowerCase())??entry.value)
      :'Brak danych';
    const field=(label,key,unit='')=>{
      const entry=bath?.[key];
      return `<div><span>${label}</span><strong>${value(entry,unit)}</strong><small>${entry?timestamp(entry.at)+(!HeatingBoard.fresh(entry.at,nowMs)?' · nieaktualne':''):'Brak aktualizacji'}</small></div>`;
    };
    return `<section class="card"><h3>Konwektor SCH700</h3>${source('Home Assistant · telemetria odczytowa')}
      <div class="board-metrics">${field('Stan włączenia','enabled')}${field('Temperatura zadana','target','°C')}
      ${field('Temperatura przy konwektorze','measured','°C')}${field('Tryb mocy','mode')}</div><p class="hint">Stan włączenia i praca elementu grzejnego to odrębne informacje.</p></section>`;

  }
  function dehumidifier(roomId, snapshot, legacy, roomReading, nowMs, historyLink=true) {
    const room=Dehumidifiers.rooms[roomId];
    const live=snapshot?.[roomId]?.latest||{};
    const old=roomId==='smallbath'?legacy?.bath:{};
    const fallback=roomReading?{
      temperature:{value:roomReading.temp,at:roomReading.at},humidity:{value:roomReading.humidity,at:roomReading.at}
    }:{};
    const field=(label,key,unit='')=>{
      const assigned=Object.hasOwn(live,key);
      const row=assigned?live[key]:(fallback[key]||old?.[key]);
      const value=row?.value;
      const formatted=typeof value==='number'?fmt(value)+unit:
        ['on','off'].includes(value)?value.toUpperCase():'Brak danych';
      const time=row?.at?timestamp(row.at):null;
      const quality=value===null||value===undefined?'Brak wiarygodnego odczytu':
        HeatingBoard.fresh(row.at,nowMs)?'Aktualny':'Nieaktualny';
      return metric(label,formatted,quality+(time?' · '+time:'')+
        (value!==null&&value!==undefined&&!assigned&&fallback[key]?' · Setti+':''));
    };
    return `<section class="card" aria-label="Osuszacz Equation · ${room.name}"><h3>Osuszacz Equation</h3>
      <p class="hint">${room.model}</p><div class="board-metrics">
      ${field('Wilgotność pomieszczenia','humidity','%')}${field('Temperatura pomieszczenia','temperature','°C')}
      ${field('Zasilanie gniazdka','relay')}${field('Moc pobierana z gniazdka','power',' W')}</div>
      <p class="hint">Stan przekaźnika i pobór mocy opisują zasilanie. Praca sprężarki nie jest mierzona.</p>
      ${historyLink?button('Historia i analizy osuszaczy','dehumidifiers'):''}</section>`;
  }

  function graph(label,rows,series,analysis,steps,bounds,color) {
    const visible=rows.filter(x=>x.value!==null&&Date.parse(x.at)>=analysis.start&&Date.parse(x.at)<=analysis.end);
    if(!visible.length)return '<p class="hint">Brak pomiarów w tym okresie.</p>';
    const [bottom,top]=bounds, W=540,H=130;
    const x=t=>36+(t-analysis.start)/(analysis.end-analysis.start)*(W-48);
    const y=v=>11+(top-v)/(top-bottom)*(H-30);
    const lines=steps.map(s=>'<path d="M '+x(s.from)+' '+y(s.a)+' L '+x(s.to)+' '+y(s.b)+'" fill="none" stroke="'+color+'" stroke-width="2"/>');
    const points=visible.map(p=>'<circle cx="'+x(Date.parse(p.at))+'" cy="'+y(p.value)+'" r="2.2" fill="'+color+'"><title>'+
      esc(timestamp(p.at)+' · '+fmt(p.value)+' '+series)+'</title></circle>');
    const shade=analysis.relay.filter(p=>p.a==='on').map(p=>'<rect x="'+x(p.from)+'" y="5" width="'+
      (x(p.to)-x(p.from))+'" height="'+(H-22)+'" fill="#dcecdf"/>');
    return '<svg class="bath-chart" role="img" aria-label="'+esc(label)+'" viewBox="0 0 '+W+' '+H+'">'+shade.join('')+
      '<text x="5" y="15" font-size="12">'+top+'</text><text x="5" y="'+(H-16)+'" font-size="12">'+bottom+'</text>'+
      lines.join('')+points.join('')+'</svg>';
  }

  function dehumidifierAnalysis(snapshot, days, nowMs=Date.now()){
    const choice=`<label for="dehumidifierDays">Okres</label><select id="dehumidifierDays" data-change="dehumidifier-days">
      ${[[1,'24 godziny'],[7,'7 dni'],[14,'14 dni']].map(([value,name])=>
        `<option value="${value}"${value===days?' selected':''}>${name}</option>`).join('')}</select>`;
    const reports=Object.entries(Dehumidifiers.rooms).map(([id,room])=>{
      const history=snapshot?.[id]?.history||{};
      const a=Dehumidifiers.analyze(history,days,nowMs);
      const peak=a.power.reduce((n,r)=>Date.parse(r.at)>=a.start?Math.max(n,r.value??0):n,50);
      const g=(label,field,rows,max,color,limit)=>{
        const connected=Dehumidifiers.pairs(rows,limit,a.start,a.end);
        return '<h4>'+label+'</h4>'+graph(label+' · '+room.name,rows,field,a,connected,[0,max],color);
      };
      const elapsed=ms=>ms===0?'0 min':HeatingBoard.elapsed(ms).replace('<','&lt;');
      const energy=a.energy?fmt(a.energy.value,3)+' kWh · '+(a.energy.estimated?'szacunek z mocy':'z licznika')+
         ' · pokrycie '+elapsed(a.energy.ms):'Brak podstaw do obliczenia';
      const windows=a.relay.reduce((out,span)=>{
        if(span.a!=='on')return out;
        const last=out.at(-1);
        if(last&&last.to===span.from)last.to=span.to;
        else out.push({from:span.from,to:span.to});
        return out;
      },[]);
      return `<section class="card"><h3>${room.name} · Equation ${room.model}</h3>
       <p class="hint">${timestamp(a.start)} – ${timestamp(a.end)} · zielone tło oznacza zasilanie w obserwowanych przedziałach.</p>
       <div class="board-metrics">${metric('Czas zasilania',a.knownMs?elapsed(a.onMs):'Brak danych',
       a.knownMs?'Obserwacja '+elapsed(a.knownMs)+' · brak danych '+elapsed(a.end-a.start-a.knownMs):'Brak potwierdzonego przedziału')}
       ${metric('Energia elektryczna',energy)}</div>
       ${g('Wilgotność pomieszczenia','% RH',a.humidity,100,'#176f6a',Dehumidifiers.humidityGap)}
       ${g('Moc pobierana z gniazdka','W',a.power,Math.ceil(peak/50)*50,'#8e5827',Dehumidifiers.gap)}
       <details class="bath-history-list"><summary>Okresy ON/OFF</summary>
       ${windows.length?'<ul>'+windows.slice(-20).reverse().map(p=>'<li>ON · '+esc(interval({start:p.from,end:p.to}))+'</li>').join('')+'</ul>':''}
       ${(history.relay||[]).length?'<ul>'+(history.relay||[]).filter(p=>Date.parse(p.at)>=a.start)
        .filter((p,i,rows)=>!i||p.value!==rows[i-1].value).slice(-25).reverse().map(p=>'<li>'+
         (p.value?.toUpperCase()||'Brak danych')+' · '+esc(timestamp(p.at))+'</li>').join('')+'</ul>':'<p>Brak historii gniazdka.</p>'}</details>
       <h4>Wilgotność przed i po włączeniu</h4>
       ${a.drops.length?'<ul>'+a.drops.slice(-8).reverse().map(x=>'<li>'+esc(timestamp(x.at))+' · '+
        fmt(x.before.value)+'% ('+esc(timestamp(x.before.at))+') → '+fmt(x.after.value)+'% ('+esc(timestamp(x.after.at))+
        ') · różnica '+fmt(x.change)+' p.p.</li>').join('')+'</ul>':'<p>Brak porównywalnej pary pomiarów w tym okresie.</p>'}
       </section>`;
    });
    return back('Wróć do analiz','analysis')+sec('Osuszacze Equation','Odczyty Home Assistant z prywatnego archiwum.')+
      choice+'<p class="hint">Przerwy w pomiarach pozostają widoczne. Porównanie wilgotności opisuje zmianę od odczytu sprzed włączenia do odczytu 30–60 minut później podczas obserwowanego zasilania.</p>'+
      '<div class="grid cols2">'+reports.join('')+'</div>';
  }

  return {dashboard,rooms,analysis,more,gasForm,gasSummary,boilerForm,coForm,air,comfort,bath,dehumidifier,dehumidifierAnalysis,counterValue,gainLabel};
})();
