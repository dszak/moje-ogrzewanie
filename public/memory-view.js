'use strict';
// v1.8 user interface: the user's private card, cumulative learning and reviewed AI suggestions.
const MemoryView=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const LABELS={overview:'Charakterystyka mieszkania',installation:'Instalacja i grzejniki',sensors:'Czujniki, źródła danych i sterowanie',
   comfort:'Cele komfortu i ekonomii',constraints:'Ograniczenia, zakłócenia i bezpieczeństwo',
   currentQuestion:'Aktualne pytanie badawcze'};
 const HINTS={overview:'Tylko prywatnie: np. liczba pomieszczeń, strych, izolacja, czynniki wpływające na straty ciepła.',
   installation:'Model kotła, grzejniki, nastawy, zasady działania instalacji.',
   sensors:'ENGO, Setti+, głowice, pochodzenie danych i ograniczenia pomiarów.',
   comfort:'Co dla Ciebie oznacza dobry komfort i uzasadnione oszczędności?',
   constraints:'Co może zafałszować wynik? Wietrzenie, CWU, dodatkowe ogrzewanie, przerwy w zapisach.',
   currentQuestion:'Jedno konkretne zagadnienie, które chcemy rozstrzygnąć jako następne.'};
 function select(id,choices,selected){
   return '<select id="'+id+'">'+Object.entries(choices).map(([key,val])=>
     '<option value="'+key+'" '+(selected===key?'selected':'')+'>'+esc(val)+'</option>').join('')+'</select>';
 }
 function render(state,preview=null,draft=''){
   const card={...MemoryKit.EMPTY_CARD(),...(state.projectMemory||{})};
   const entries=(state.knowledgeLog||[]).slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
   const current=entries.filter(x=>x.status==='current');
   let out='<div class="section-head"><div><h2>Pamięć i optymalizacja</h2>'+
     '<p>Nie zaczynamy od zera. Każdy eksperyment ma dać poprawę lub wartościową wiedzę.</p></div></div>';
   const ethics=MemoryKit.ETHICS;
   out+='<section class="card moral-principles" aria-label="Zasada naczelna i cnoty kardynalne">'+
     '<div class="group-heading"><h3>Zasada naczelna</h3></div>'+
     '<p class="moral-motto">'+esc(ethics.principle)+'</p>'+
     '<p class="moral-purpose">'+esc(ethics.purpose)+'</p>'+
     '<h4>Cztery cnoty kardynalne</h4>'+
     '<div class="virtues-grid">'+ethics.virtues.map(v=>
       '<article class="virtue"><h4>'+esc(v.name)+'</h4>'+
       '<p>'+esc(v.definition)+'</p>'+
       '<p class="hint">'+esc(v.practice)+'</p></article>').join('')+'</div>'+
     '<div class="note"><b>Przed każdą decyzją:</b> '+esc(ethics.decision_test)+'</div>'+
     '<p class="hint">'+esc(ethics.hierarchy)+'</p>'+
     '<p class="hint">'+esc(ethics.note)+'</p>'+
     '</section>';
   out+='<div class="banner info"><span>🧠</span><span><b>'+esc(MemoryKit.METHOD)+'</b><br>'+
     esc(MemoryKit.GOAL)+'</span></div>';
   out+='<section class="card" style="margin:16px 0"><div class="group-heading"><h3>1. Trwała karta projektu</h3><span class="pill">Prywatna</span></div>'+
     '<p class="hint">Uzupełnij raz i aktualizuj, gdy odkryjemy coś nowego. Te informacje będą dołączane do każdego raportu ChatGPT, niezależnie od okresu pomiarów. Nie wpisuj haseł, tokenów ani danych, których nie chcesz wysyłać w raportach.</p>'+
     '<div class="form-grid">'+MemoryKit.CARD_FIELDS.map(key=>
       '<div class="wide"><label for="memory-'+key+'">'+esc(LABELS[key])+'</label>'+
       '<textarea id="memory-'+key+'" rows="'+(key==='currentQuestion'?2:4)+'" maxlength="'+(key==='currentQuestion'?1500:key==='comfort'||key==='constraints'?3000:4000)+'" placeholder="'+esc(HINTS[key])+'">'+
       esc(card[key])+'</textarea></div>').join('')+'</div>'+
     '<div class="actions" style="margin-top:12px"><button class="action" data-action="memory-card-save">Zapisz kartę projektu</button></div>'+
     '<p class="hint">Ostatnia edycja: '+(card.updatedAt?esc(new Date(card.updatedAt).toLocaleString('pl-PL')):'jeszcze nie zapisana')+'</p></section>';
   out+='<section class="card" style="margin-bottom:16px"><div class="group-heading"><h3>2. Rejestr zdobytej wiedzy</h3><span class="pill">'+current.length+' aktualnych</span></div>'+
      '<p>Oddzielamy <b>obserwacje</b>, <b>hipotezy</b>, <b>wyniki eksperymentów</b> i <b>sprawdzone konfiguracje</b>.'+
      ' Gromadzimy także wnioski negatywne i nierozstrzygnięte. Sama deklaracja „sprawdzona” nie zastępuje pomiarów.</p>'+
      '<div class="form-grid" style="margin-top:16px">'+
      '<div><label for="memoryKind">Typ</label>'+select('memoryKind',MemoryKit.KINDS,'observation')+'</div>'+
      '<div><label for="memoryConfidence">Pewność oceny (subiektywna)</label>'+select('memoryConfidence',MemoryKit.CONFIDENCE,'low')+'</div>'+
      '<div><label for="memoryOutcome">Wynik próby</label>'+select('memoryOutcome',MemoryKit.OUTCOMES,'none')+'</div>'+
      '<div><label for="memoryExperiment">Powiązany eksperyment</label>'+select('memoryExperiment',{none:'Brak',...Object.fromEntries(state.experiments.map(e=>[e.id,e.title]))},'none')+'</div>'+
      '<div class="wide"><label for="memoryTitle">Tytuł ustalenia</label><input id="memoryTitle" maxlength="120" placeholder="np. Stabilność temperatury sypialni"></div>'+
      '<div class="wide"><label for="memoryConclusion">Co dokładnie ustaliliśmy?</label><textarea id="memoryConclusion" rows="3" maxlength="1800"></textarea></div>'+
      '<div class="wide"><label for="memoryEvidence">Na jakiej podstawie? (dowody, daty, pliki)</label><textarea id="memoryEvidence" rows="3" maxlength="1800"></textarea></div>'+
      '<div class="wide"><label for="memoryConditions">W jakich warunkach wniosek ma zastosowanie?</label><textarea id="memoryConditions" rows="2" maxlength="800"></textarea></div></div>'+
      '<div class="actions" style="margin-top:12px"><button class="action" data-action="memory-add">Zapisz nowy wniosek</button></div>'+
      '<div class="hr"></div><h4>Wiedza, z której korzystamy w kolejnych analizach</h4>'+
      (entries.length?entries.map(entry=>
         '<article class="review-entry"><div class="group-heading"><strong>'+esc(entry.title)+'</strong><span class="pill">'+esc(MemoryKit.KINDS[entry.kind])+'</span></div>'+
         '<p class="small muted">'+esc(new Date(entry.at).toLocaleString('pl-PL'))+' · '+esc(MemoryKit.CONFIDENCE[entry.confidence])+
         ' pewność · '+(entry.status==='current'?'Aktualny':'Zastąpiony')+
         (entry.source==='chatgpt-reviewed'?' · propozycja ChatGPT zaakceptowana ręcznie':'')+'</p>'+
         '<p>'+esc(entry.conclusion)+'</p>'+
         (entry.evidence?'<p class="hint"><b>Dowody:</b> '+esc(entry.evidence)+'</p>':'')+
         (entry.conditions?'<p class="hint"><b>Warunki:</b> '+esc(entry.conditions)+'</p>':'')+
         (entry.kind==='result'?'<p class="hint"><b>Wynik:</b> '+esc(MemoryKit.OUTCOMES[entry.outcome])+'</p>':'')+
         (entry.experimentId?'<p class="hint">Eksperyment: '+esc(state.experiments.find(e=>e.id===entry.experimentId)?.title||entry.experimentId)+'</p>':'')+
         (entry.status==='current'?'<div class="actions"><button class="action ghost" data-action="memory-supersede" data-id="'+esc(entry.id)+'">Oznacz jako zastąpiony</button></div>':'')+
         '</article>').join(''):
        '<div class="empty">Nie ma jeszcze zapisanych wniosków. Warto zacząć od pierwszej analizy z 15 listopada.</div>')+
      '</section>';
   out+='<section class="card" style="margin-bottom:16px"><h3>3. Przenieś wiedzę z ChatGPT do aplikacji</h3>'+
     '<p>Po każdej analizie poproś ChatGPT o propozycje zapisów. Wklej JSON lub wybierz plik, obejrzyj podgląd, a dopiero potem zatwierdź. <b>Nic nie zostaje dopisane automatycznie.</b></p>'+
     '<div class="actions" style="margin:12px 0"><button class="action ghost" data-action="memory-copy-request">Kopiuj instrukcję dla ChatGPT</button>'+
     '<button class="action ghost" data-action="memory-import-file">Wybierz plik JSON</button></div>'+
     '<label for="memoryBulk">Propozycje wniosków JSON</label><textarea id="memoryBulk" rows="6" spellcheck="false" placeholder="Wklej propozycje JSON...">'+esc(draft)+'</textarea>'+
     '<div class="actions" style="margin-top:10px"><button class="action" data-action="memory-preview">Sprawdź propozycje</button>'+
     '<button class="action ghost" data-action="memory-clear">Wyczyść pole</button></div>';
   if(preview){
     out+='<div class="note" style="margin-top:14px"><b>Podgląd:</b> '+preview.items.length+' nowych propozycji; '+preview.duplicates+' duplikatów.'+
       '<p class="hint">To propozycje, nie zweryfikowane automatycznie fakty. Ocenę i dowody należy sprawdzić.</p>'+
       preview.items.map(x=>'<div class="item"><b>'+esc(x.title)+'</b> · '+esc(MemoryKit.KINDS[x.kind])+
         '<p>'+esc(x.conclusion)+'</p>'+
         '<p class="hint">Dowody: '+esc(x.evidence||'nie podano')+' · warunki: '+esc(x.conditions||'nie podano')+
         ' · pewność: '+esc(MemoryKit.CONFIDENCE[x.confidence])+'</p></div>').join('')+
       '<div class="actions"><button class="action" data-action="memory-confirm">Zatwierdź i dopisz '+preview.items.length+' wniosków</button>'+
       '<button class="action ghost" data-action="memory-cancel">Anuluj</button></div></div>';
   }
   out+='</section>';
   out+='<section class="card" style="margin-bottom:16px"><div class="group-heading"><h3>Baza wiedzy technicznej</h3><span class="pill">'+HeatingResearch.SOURCES.length+' źródeł</span></div>'+
     '<p>Nie musimy odkrywać praw fizyki od początku. Korzystamy z dokumentacji producentów, badań i poradników inżynierskich. '+ 
     '<b>To wiedza ogólna, nie wynik eksperymentu w tym mieszkaniu.</b> Każde źródło ma ograniczenia.</p>'+
     HeatingResearch.SOURCES.map(src=>
        '<details style="margin-top:11px;border-bottom:1px solid var(--line);padding-bottom:9px"><summary><b>'+esc(src.topic)+'</b> — '+esc(src.level)+'</summary>'+
        '<p class="hint">'+esc(src.finding)+'</p>'+
        '<p><b>Jak wykorzystać:</b> '+esc(src.meaning)+'</p>'+
        '<p class="hint"><b>Granice:</b> '+esc(src.limit)+'</p>'+
        '<p><a href="'+esc(src.url)+'" target="_blank" rel="noopener noreferrer">'+esc(src.title)+'</a></p></details>'
     ).join('')+
     '<div class="hr"></div><h4>Kierunki badań wynikające z wiedzy technicznej</h4>'+
     HeatingResearch.TOPICS.map((topic,i)=>'<div class="review-entry"><b>'+String(i+1)+'. '+esc(topic.title)+'</b>'+
       '<p>'+esc(topic.why)+'</p><p class="hint"><b>Co robić:</b> '+esc(topic.method)+'</p>'+
       '<p class="hint"><b>Jaki wynik uznać za przydatny:</b> '+esc(topic.success)+'</p></div>').join('')+
     '<p class="hint">Nie wykonuj wszystkich badań naraz. Kolejną próbę wybieramy po analizie pomiarów i wcześniejszych wyników. Źródła sprawdzono '+esc(HeatingResearch.VERIFIED)+'.</p></section>';

   out+='<section class="card"><h3>4. Kontynuacja w nowej rozmowie</h3>'+
     '<p>Przejdź do zakładki <b>Analiza i decyzje</b>, pobierz aktualny raport JSON i załącz go do nowego czatu. '+ 
     'Raport zawiera całą kartę projektu, historię wniosków, decyzji i eksperymentów — także sprzed wybranego okresu pomiarów.</p>'+
     '<div class="actions" style="margin-top:12px"><button class="action ghost" data-action="memory-copy-intro">Kopiuj instrukcję rozpoczęcia rozmowy</button>'+
     '<button class="action" data-action="page" data-page="review">Przejdź do raportu</button></div>'+
     '<p class="hint">Dane pozostają na tym urządzeniu do momentu samodzielnego udostępnienia raportu. Twórz kopie JSON w Ustawieniach.</p></section>';
   return out;
 }
 return {render};
})();
