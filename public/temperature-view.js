'use strict';
// View-only temperature timeline, fed by private local Home Assistant CSV history.
const TemperatureView=(()=>{
 const colors={bedroom:'#117d72',salon:'#2077bd',kitchen:'#ae692c',bigbath:'#8452b5',smallbath:'#c44562',hall:'#657480'};
 const format=x=>Number(x).toFixed(1).replace('.',',');
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function plot(graph,visible,airing){
  const active=graph.series.filter(s=>visible.has(s.room));
  if(!active.length)return '<p class="hint">Zaznacz przynajmniej jedno pomieszczenie, aby zobaczyć jego temperaturę.</p>';
  const W=900,H=344,L=58,R=20,T=20,B=52;
  const low=Math.floor((Math.min(...active.flatMap(s=>s.points.map(p=>p.temp)))-0.15)*2)/2;
  let high=Math.ceil((Math.max(...active.flatMap(s=>s.points.map(p=>p.temp)))+0.15)*2)/2;
  if(high<=low)high=low+1;
  const x=ms=>L+(W-L-R)*(ms-graph.start)/(graph.end-graph.start);
  const y=temp=>T+(H-T-B)*(high-temp)/(high-low);
  const grid=Array.from({length:5},(_,i)=>{
    const temp=low+(high-low)*i/4;
    return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(temp)+'" y2="'+y(temp)+'" stroke="#d8e1dc" stroke-width="1"/>'+
      '<text x="'+(L-8)+'" y="'+(y(temp)+4)+'" text-anchor="end" font-size="14" fill="#54635e">'+format(temp)+'</text>';
  }).join('');
  const ticks=Array.from({length:5},(_,i)=>{
    const ms=graph.start+(graph.end-graph.start)*i/4;
    const xx=x(ms);
    const label=i===4?'24:00':TemperatureHistory.timeLabel(ms);
    return '<line x1="'+xx+'" x2="'+xx+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#d8e1dc" stroke-width="1"/>'+
      '<text x="'+xx+'" y="'+(H-17)+'" text-anchor="middle" font-size="14" fill="#54635e">'+label+'</text>';
  }).join('');
  const heat=graph.heat.map(pair=>{
    const px=x(pair.start),width=x(pair.end)-px;
    return '<rect x="'+px+'" y="'+T+'" width="'+width+'" height="'+(H-T-B)+'" fill="#f2b766" opacity="0.27"/>';
  }).join('');
  const airMarks=airing.map(row=>{
    const left=x(row.from),width=Math.max(2,x(row.to)-left);
    return '<rect x="'+left+'" y="'+(H-B+3)+'" width="'+width+'" height="6" rx="2" fill="#268a7a"><title>'+
      escape('Wietrzenie · '+row.windows.join(' + '))+'</title></rect>';
  }).join('');
  const curves=active.map(s=>{
    const pts=s.points;let d='M '+x(pts[0].at).toFixed(2)+' '+y(pts[0].temp).toFixed(2);
    for(const p of pts.slice(1))d+=' H '+x(p.at).toFixed(2)+' V '+y(p.temp).toFixed(2);
    const dots=pts.filter(p=>!p.carried).map(p=>
      '<circle cx="'+x(p.at).toFixed(2)+'" cy="'+y(p.temp).toFixed(2)+'" r="3" fill="'+colors[s.room]+'"><title>'+escape(s.label)+' '+TemperatureHistory.timeLabel(p.at)+' · '+format(p.temp)+'°C</title></circle>'
    ).join('');
    return '<path d="'+d+'" fill="none" stroke="'+colors[s.room]+'" stroke-width="3" stroke-linejoin="round"/>'+dots;
  }).join('');
  return '<div class="temp-chart-wrap" role="region" aria-label="Przewijany wykres temperatur, od północy do północy" tabindex="0">'+
    '<svg viewBox="0 0 '+W+' '+H+'" class="temp-chart" role="img" aria-label="Temperatury sześciu pomieszczeń i okresy zapotrzebowania ENGO; szczegóły w tabeli pod wykresem" xmlns="http://www.w3.org/2000/svg">'+
    grid+ticks+heat+curves+airMarks+'<text x="'+L+'" y="12" font-size="14" fill="#54635e">°C</text></svg></div>';
 }
 function render(state,selectedDay,visible,pending,draft){
  const records=state.temperatureHistory||[],days=TemperatureHistory.days(records);
  const day=days.includes(selectedDay)?selectedDay:days[0]||null;
  let out='<div class="section-head"><div><h2>Wykresy temperatur</h2><p>Historia sześciu czujników MQTT z Home Assistant na tle cykli ENGO.</p></div></div>';
  out+='<div class="banner info"><span>ℹ️</span><span>Wczytane pomiary pozostają wyłącznie na tym urządzeniu. Home Assistant zapisuje przede wszystkim zmiany wartości — linie schodkowe pokazują ostatni znany odczyt, nie ciągły pomiar co minutę.</span></div>';
  let tools='<details class="card" '+(pending||draft||!day?'open':'')+'><summary>Import i korekty CSV</summary>';
  tools+='<section class="card" style="margin-bottom:16px"><h3>Import historii z Home Assistant</h3>'+
   '<p class="hint">Home Assistant → Historia → wybierz sześć temperatur Setti+ MQTT → ⋮ → Pobierz dane. Wczytaj pobrany plik <code>history.csv</code>, albo wklej jego zawartość. Obsługiwane kolumny: <code>entity_id,state,last_changed</code>. Import dopisuje nowe odczyty i pomija duplikaty.</p>'+
   '<label for="tempBulk">Dane CSV z Home Assistant</label><textarea id="tempBulk" rows="5" placeholder="entity_id,state,last_changed" style="width:100%">'+escape(draft||'')+'</textarea>'+
   '<div class="actions" style="margin-top:12px"><button class="action" data-action="temp-file">Wczytaj plik CSV</button><button class="action ghost" data-action="temp-preview">Sprawdź import</button><button class="action ghost" data-action="temp-clear">Wyczyść pole</button></div>'+
   '<p class="hint">Możesz wczytywać kolejne pliki z pokrywającymi się okresami. Nie musisz przepisywać pomiarów pojedynczo.</p></section>';
  if(pending){
    tools+='<section class="card temp-preview" style="margin-bottom:16px"><h3>Podgląd przed zapisem</h3><div class="panel-readings">'+
      '<div><span>Nowe wpisy</span><strong>'+pending.added+'</strong></div>'+
      '<div><span>Duplikaty</span><strong>'+pending.skipped+'</strong></div>'+
      '<div><span>Pominięte inne encje</span><strong>'+pending.ignored+'</strong></div>'+
      '<div><span>Niedostępne odczyty</span><strong>'+pending.unavailable+'</strong></div></div>'+
      '<div class="temp-import-breakdown">'+Object.entries(TemperatureHistory.roomNames).map(([room,label])=>
       '<span>'+escape(label)+': '+(pending.counts[room]||0)+'</span>').join('')+'</div>'+
      '<div class="actions"><button class="action" data-action="temp-confirm" '+(pending.added===0?'disabled':'')+'>Zatwierdź import</button>'+
      '<button class="action ghost" data-action="temp-cancel">Anuluj</button></div></section>';
  }
  tools+='</details>';
  out+='<section class="card"><div class="group-heading"><h3>Temperatury i cykle ENGO</h3><span class="pill">'+records.length+' zapisów</span></div>';
  if(!day){
    out+='<p class="hint">Nie ma jeszcze historii. Zaimportuj CSV z Home Assistant, aby zobaczyć wykres.</p></section>';
    return out+tools;
  }
  const graph=TemperatureHistory.graph(records,day,EngoCycles.analyze(state.engoCycles||[]).pairs);
  const airing=(state.ventilation||[]).filter(row=>row.ended).map(row=>({
    ...row,from:Math.max(graph.start,Date.parse(row.started)),to:Math.min(graph.end,Date.parse(row.ended))
  })).filter(row=>row.to>row.from);
  out+='<div class="form-grid"><div><label for="tempDay">Dzień</label><select id="tempDay" data-change="temp-day">'+days.map(d=>
    '<option value="'+d+'" '+(d===day?'selected':'')+'>'+d+'</option>').join('')+'</select></div></div>'+
    '<p class="hint">Wybierz pomieszczenia, które chcesz porównać. Jasnopomarańczowe tło oznacza pełne cykle zapotrzebowania ENGO zapisane w zakładce „Cykle ENGO”.</p>'+
    '<div class="temp-legend">'+Object.entries(TemperatureHistory.roomNames).map(([room,label])=>
      '<button class="action ghost temp-room '+(visible.has(room)?'selected':'')+'" data-action="temp-toggle" data-room="'+room+'" aria-pressed="'+visible.has(room)+'">'+
      '<span class="temp-dot" style="background:'+colors[room]+'"></span>'+escape(label)+'</button>').join('')+'</div>';
  if(graph.series.length){
    out+=plot(graph,visible,airing);
    if(airing.length)out+='<p class="hint">Zielone kreski to ręcznie zapisane okresy wietrzenia.</p><ul>'+
      airing.map(row=>'<li>'+escape(row.windows.join(' + '))+' · '+escape(HeatingBoard.when(row.started))+
        ' – '+escape(HeatingBoard.when(row.ended))+'</li>').join('')+'</ul>';
    out+='<p class="hint">Punkty na liniach odpowiadają zarejestrowanym zmianom temperatury. Początek odcinka może pochodzić z poprzedniego dnia, jeżeli mamy wcześniejszy zapis. Brak danych nie jest uzupełniany sztucznymi pomiarami.</p>'+
     '<h4>Zakresy temperatur i liczba zmian ('+escape(day)+')</h4>'+
     '<div class="table-scroll"><table class="table temp-summary"><thead><tr><th>Pomieszczenie</th><th>Zmiany</th><th>Min.</th><th>Maks.</th></tr></thead><tbody>'+
     graph.summary.map(r=>'<tr><td>'+escape(r.label)+'</td><td>'+r.count+'</td><td>'+format(r.min)+'°C</td><td>'+format(r.max)+'°C</td></tr>').join('')+
     '</tbody></table></div>';
  }else out+='<p class="hint">Nie znaleziono zmian temperatury w wybranym dniu.</p>';
  out+='<div class="actions" style="margin-top:16px"><button class="action danger" data-action="temp-delete-day" data-day="'+escape(day)+'">Usuń pomiary tego dnia</button></div>'+
    '<p class="hint">Usuwanie wymaga potwierdzenia. Przed większymi zmianami pobierz kopię JSON w Ustawieniach. Wykres nie zmienia ustawień ENGO, głowic ani kotła.</p></section>';
  return out+tools;
 }
 return {render};
})();
