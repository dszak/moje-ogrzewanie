'use strict';
// Plain, phone-friendly front end for See–Judge–Act; no direct ChatGPT/network calls.
const ReviewView=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const OPTIONS={keep:'Pozostawić ustawienia',observe:'Zebrać więcej danych',experiment:'Przeprowadzić eksperyment'};
 function render(state,period,editId,report){
   const setting=value=>Number.isFinite(value)?esc(value)+'°C':'—';
   const decisions=(state.decisionLog||[]).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
   const edit=editId?decisions.find(d=>d.id===editId):null;
   const current=report||HeatingReview.build(state,period);
   const roomStats=current.temperature_history.rooms.filter(x=>x.count>0).map(x=>
     '<div class="review-room"><b>'+esc(x.name)+'</b><span>'+x.count+' zmian · '+x.min_c+'–'+x.max_c+'°C</span></div>').join('');
   const active=state.experiments.filter(e=>e.status==='active');
   let out='<div class="section-head"><div><h2>Widzieć · Ocenić · Działać</h2>'+
     '<p>Od pomiarów do rozsądnych decyzji o komforcie i kosztach ogrzewania.</p></div></div>';
   out+='<section class="card" style="margin-bottom:16px"><div class="group-heading"><h3>1. WIDZIEĆ — przygotuj dane</h3><span class="pill">Lokalnie</span></div>'+
    '<label for="reviewPeriod">Okres raportu</label>'+
    '<select id="reviewPeriod" data-change="review-period" style="margin-bottom:14px">'+
    Object.entries(HeatingReview.PERIODS).map(([key,p])=>'<option value="'+key+'" '+(period===key?'selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select>'+
    '<div class="panel-readings">'+
     '<div><span>Zmiany temperatury MQTT</span><strong>'+current.temperature_history.rooms.reduce((n,r)=>n+r.count,0)+'</strong></div>'+
     '<div><span>Pełne cykle ENGO</span><strong>'+current.engo.completed_pairs_fully_in_period.length+'</strong></div>'+
     '<div><span>Czas zapotrzebowania</span><strong>'+current.engo.completed_minutes_fully_in_period+' min</strong></div>'+
     '<div><span>Godziny pogody</span><strong>'+current.outdoor_weather.hours_available+'/'+current.outdoor_weather.hours_expected+'</strong></div>'+
     '</div>'+
    '<h4>Obserwacje z sześciu pomieszczeń</h4>'+
    (roomStats?'<div class="review-rooms">'+roomStats+'</div>':'<p class="hint">Brak zmian temperatury MQTT w tym okresie.</p>')+
    '<h4 style="margin-top:18px">Podsumowanie, które otrzyma ChatGPT</h4>'+
    '<pre class="review-summary">'+esc(current.readable_summary)+'</pre>'+
    '<div class="actions"><button class="action" data-action="review-export">Pobierz raport dla ChatGPT (JSON)</button>'+
    '<button class="action ghost" data-action="review-copy">Kopiuj podsumowanie</button></div>'+
    '<p class="hint">Pakiet zawiera pomiary z wybranego okresu oraz całą kartę projektu, wiedzę, decyzje i eksperymenty także sprzed tego okresu. '+ 
    'Nie zawiera mapy, dziennika zdarzeń ani danych logowania. Zawiera natomiast informacje z prywatnej karty projektu i zapisane wnioski. Jest zapisywany na urządzeniu — niczego nie wysyłamy automatycznie. Przejrzyj go przed załączeniem do rozmowy.</p></section>';
   out+='<section class="card" style="margin-bottom:16px"><h3>2. OCENIĆ — omów raport w ChatGPT</h3>'+
    '<p>Prześlij pobrany plik JSON w rozmowie o ogrzewaniu — także nowej. Poproś o oddzielenie <b>pomiarów</b>, <b>wniosków</b> i <b>niepewności</b>.'+
    ' Rozważymy stabilność temperatur, możliwą bezwładność cieplną i zużycie gazu z uwzględnieniem pogody.</p>'+
    '<div class="note" style="margin-top:12px">Nie wyznaczamy sprawności palnika na podstawie samych cykli ENGO. Przedział bez odczytów gazomierza nie jest „zerowym zużyciem”.</div></section>';
   out+='<section class="card" style="margin-bottom:16px"><h3>3. DZIAŁAĆ — zapisz wynik oceny</h3>'+
    '<p class="hint">Zapisz wnioski i uzgodniony następny krok. Przy połączonym dzienniku pojawią się tu również decyzje zatwierdzone w rozmowie.</p>'+
    '<div class="form-grid">'+
    '<div class="wide"><label for="reviewChoice">Decyzja</label><select id="reviewChoice">'+
      Object.entries(OPTIONS).map(([id,label])=>'<option value="'+id+'" '+((edit?.choice||'observe')===id?'selected':'')+'>'+label+'</option>').join('')+
    '</select></div>'+
    '<div class="wide"><label for="reviewAssessment">Ocena i uzasadnienie</label><textarea id="reviewAssessment" rows="5" maxlength="4000" placeholder="Co potwierdzają pomiary? Co pozostaje niepewne?">'+esc(edit?.assessment||'')+'</textarea></div>'+
    '<div class="wide"><label for="reviewAction">Uzgodnione działanie (opcjonalne)</label><textarea id="reviewAction" rows="3" maxlength="1500" placeholder="Co zrobić lub czego nie zmieniać?">'+esc(edit?.action||'')+'</textarea></div>'+
    '<div><label for="reviewOn">Data ponownej oceny (opcjonalnie)</label><input id="reviewOn" type="date" value="'+esc(edit?.reviewOn||'')+'"></div>'+
    '<div><label for="reviewExperiment">Powiązany eksperyment (opcjonalnie)</label><select id="reviewExperiment">'+
      '<option value="">Brak</option>'+state.experiments.map(e=>'<option value="'+esc(e.id)+'" '+(edit?.experimentId===e.id?'selected':'')+'>'+esc(e.title)+'</option>').join('')+
      '</select></div></div>'+
    (active.length?'<p class="hint">Trwający eksperyment: '+active.map(e=>esc(e.title)).join(', ')+'.</p>':'')+
    '<div class="actions" style="margin-top:13px"><button class="action" data-action="review-save">'+(edit?'Zapisz poprawkę':'Zapisz ocenę i decyzję')+'</button>'+
    (edit?'<button class="action ghost" data-action="review-cancel">Anuluj</button>':'')+'</div></section>';
   out+='<section class="card"><div class="group-heading"><h3>Dziennik ocen i decyzji</h3><span class="pill">'+decisions.length+'</span></div>'+
    (decisions.length?decisions.map(d=>'<article class="review-entry"><div class="group-heading"><strong>'+esc(OPTIONS[d.choice]||d.choice)+'</strong><span class="small muted">'+esc(new Date(d.at).toLocaleString('pl-PL'))+'</span></div>'+
       '<p>'+esc(d.assessment)+'</p>'+
       (d.action?'<p><b>Działanie:</b> '+esc(d.action)+'</p>':'')+
       (d.reviewOn?'<p class="hint">Ponowna ocena: '+esc(d.reviewOn)+'</p>':'')+
       '<p class="hint">Ustawienia przy decyzji: ENGO '+setting(d.settings.engo)+' · kocioł '+setting(d.settings.boiler)+'</p>'+
       (typeof JournalView==='undefined'?'':JournalView.revisions('decision',d.id))+
       '<div class="actions"><button class="action ghost" data-action="review-edit" data-id="'+esc(d.id)+'">Edytuj</button>'+
       '<button class="action danger" data-action="review-delete" data-id="'+esc(d.id)+'">Archiwizuj</button></div></article>').join(''):
       '<p class="hint">Nie ma jeszcze ocen. Pierwsza pojawi się tu po zapisaniu wspólnej decyzji.</p>')+'</section>';
   return out;
 }
 return {render,OPTIONS};
})();
