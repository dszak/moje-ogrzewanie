'use strict';
// v1.8: private, portable project context. No AI network calls, credentials, or device controls.
const MemoryKit=(()=>{
  const GOAL='Stopniowo poznać instalację i minimalizować koszt utrzymania komfortu, bez pogorszenia bezpieczeństwa.';
  const METHOD='WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ';

  // Public project charters live in the repository. References supplement, not replace,
  // the embedded principles and technical research that make offline exports useful.
  const PROJECT_DOCUMENTATION=[
    {
      id:'fundamental-principles',
      title:'Fundamentalne zasady projektu „Moje Ogrzewanie”',
      url:'https://github.com/dszak/moje-ogrzewanie/blob/main/docs/NAJWAZNIEJSZE-ZASADY-PROJEKTU.md',
      purpose:'Nadrzędny wybór dobra, cztery cnoty kardynalne, hierarchia celów, ocena decyzji, metodologia eksperymentów, bezpieczeństwo.',
      priority:'Przeczytaj przed wydaniem rekomendacji i przed projektowaniem eksperymentu.'
    },
    {
      id:'technical-knowledge',
      title:'Baza wiedzy technicznej — nie odkrywać ogrzewania od nowa',
      url:'https://github.com/dszak/moje-ogrzewanie/blob/main/docs/BAZA-WIEDZY-TECHNICZNEJ.md',
      purpose:'Zweryfikowane źródła techniczne, ograniczenia wnioskowania, zasady rozdzielania literatury od wyników konkretnego mieszkania i hierarchia badań.',
      priority:'Przeczytaj przed analizą techniczną i decyzją o eksperymencie.'
    }
  ];

  // Moral foundation from the project's governing charter; not a household observation.
  const ETHICS={
    principle:'Dobrze gospodarować powierzonym mi dobrem.',
    purpose:'Rozpoznawać i wybierać dobro oraz podejmować umiejętne decyzje prowadzące do jego realizacji.',
    virtues:[
      {name:'Roztropność',latin:'prudentia',
       definition:'Rozpoznawać prawdziwe dobro i wybierać właściwy sposób jego osiągnięcia.',
       practice:'Korzystać z prawdziwych danych, rozważać skutki i wybierać środki odpowiednie do dobra, któremu służą.'},
      {name:'Sprawiedliwość',latin:'iustitia',
       definition:'Oddawać każdemu to, co mu się należy.',
       practice:'Bogu — cześć i wdzięczność; sobie — zdrowie i godne warunki; gościom — gościnność i komfort; ORLENOWI — uczciwe rozliczenie. Dbać o budynek i przyrodę jako powierzone dobra.'},
      {name:'Umiarkowanie',latin:'temperantia',
       definition:'Panować nad pragnieniami, zachować równowagę w używaniu dóbr doczesnych i powstrzymywać się od nadużyć.',
       practice:'Unikać zarówno przegrzewania i marnowania energii, jak i oszczędzania kosztem zdrowia i koniecznego komfortu.'},
      {name:'Męstwo',latin:'fortitudo',
       definition:'Zachowywać stałość i wytrwałość w dążeniu do dobra oraz pokonywać przeszkody i pokusy.',
       practice:'Cierpliwie zbierać dane, korygować błędne decyzje, wytrwale realizować te dobre i reagować na zagrożenia.'}
    ],
    decision_test:'Jakie dobro chcemy osiągnąć? Co jest komu należne? Czy zachowujemy właściwą miarę? Czy wybrane środki prowadzą do dobra i czy potrafimy wytrwać w dobrym wyborze?',
    hierarchy:'Dobro i odpowiedzialność → bezpieczeństwo i potrzeby osób → komfort i rozważne gospodarowanie zasobami → pomiary, automatyzacja i optymalizacja techniczna.',
    note:'Cnoty kardynalne zachowują znaczenie moralne. Ich zastosowanie do ogrzewania nie sprowadza ich do sposobu oszczędzania gazu.'
  };

  const CARD_FIELDS=['overview','installation','sensors','comfort','constraints','currentQuestion'];
  const KINDS={observation:'Obserwacja',hypothesis:'Hipoteza',result:'Wynik eksperymentu',configuration:'Sprawdzona konfiguracja'};
  const CONFIDENCE={low:'Niska',medium:'Średnia',high:'Wysoka'};
  const OUTCOMES={positive:'Korzystny',negative:'Niekorzystny',inconclusive:'Nierozstrzygnięty',none:'Nie dotyczy'};
  const EMPTY_CARD=()=>({overview:'',installation:'',sensors:'',comfort:'',constraints:'',currentQuestion:'',updatedAt:null});
  const safeString=(value,max,name,required=false)=>{
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Nieprawidłowe pole „'+name+'” (limit '+max+' znaków).');
    return value.trim();
  };
  function validateProposal(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||input.format!=='moje-ogrzewanie-propozycje-wiedzy'||input.version!==1||!Array.isArray(input.items)||!input.items.length||input.items.length>15)
      throw Error('Oczekiwano pliku propozycji wiedzy w formacie v1 z 1–15 wpisami.');
    return input.items.map((raw,i)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Nieprawidłowy wpis '+(i+1)+'.');
      const kind=raw.kind,confidence=raw.confidence,outcome=raw.outcome??'none';
      if(!Object.hasOwn(KINDS,kind)||!Object.hasOwn(CONFIDENCE,confidence)||!Object.hasOwn(OUTCOMES,outcome))
        throw Error('Wpis '+(i+1)+': nieznany typ, pewność lub wynik.');
      if(kind!=='result'&&outcome!=='none')throw Error('Wynik pozytywny/negatywny dotyczy tylko typu „Wynik eksperymentu”.');
      if(kind==='result'&&outcome==='none')throw Error('Wynik eksperymentu musi mieć ocenę: korzystny, niekorzystny lub nierozstrzygnięty.');
      if(raw.experimentId!==null&&raw.experimentId!==undefined&&typeof raw.experimentId!=='string')
        throw Error('Niepoprawne powiązanie eksperymentu.');
      return {kind,title:safeString(raw.title,120,'tytuł',true),
        conclusion:safeString(raw.conclusion,1800,'wniosek',true),
        evidence:safeString(raw.evidence,1800,'dowody'),
        conditions:safeString(raw.conditions,800,'warunki'),
        confidence,outcome,
        experimentId:raw.experimentId?safeString(raw.experimentId,100,'identyfikator eksperymentu'):null};
    });
  }
  // Match content, not sender-generated IDs, to prevent duplicate imports.
  const signature=e=>JSON.stringify([e.kind,e.title,e.conclusion,e.evidence,e.conditions,e.confidence,e.outcome,e.experimentId]);
  function parseProposal(text,existing=[],experiments=[]){
    if(typeof text!=='string'||text.length>50000)throw Error('Plik z wnioskami jest za duży (maksymalnie 50 KB).');
    const items=validateProposal(JSON.parse(text));
    const known=new Set(existing.map(signature)),found=[],seen=new Set();
    let duplicates=0;
    for(const item of items){
      if(item.experimentId&&!experiments.some(x=>x.id===item.experimentId))
        throw Error('Powiązany eksperyment nie istnieje: '+item.experimentId);
      const sig=signature(item);
      if(known.has(sig)||seen.has(sig)){duplicates++;continue}
      found.push(item);seen.add(sig);
    }
    return {items:found,duplicates,total:items.length};
  }
  function createRecord(raw,source='manual',at=new Date().toISOString()){
    if(!['manual','chatgpt-reviewed'].includes(source))throw Error('Nieznane źródło wpisu.');
    const validated=validateProposal({format:'moje-ogrzewanie-propozycje-wiedzy',version:1,items:[raw]})[0];
    return {...validated,id:'wiedza-'+Date.parse(at).toString(36)+'-'+Math.random().toString(36).slice(2,8),
      at,status:'current',source};
  }
  function augment(report,state){
    const card={...EMPTY_CARD(),...(state.projectMemory||{})};
    const history=(state.knowledgeLog||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const decisions=(state.decisionLog||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
      .map(d=>({id:d.id,at:d.at,period:{start:d.periodStart,end:d.periodEnd,key:d.periodKey},
        choice:d.choice,assessment:d.assessment,action:d.action,review_on:d.reviewOn,
        experiment_id:d.experimentId,settings_at_decision:d.settings}));
    const experiments=(state.experiments||[]).slice().sort((a,b)=>Date.parse(a.started)-Date.parse(b.started)).map(e=>({
      id:e.id,title:e.title,description:e.description,started:e.started,status:e.status,start:e.start,
      ...(e.status==='done'?{ended:e.ended,end:e.end,notes:e.notes}:{} )
    }));
    const current=history.filter(x=>x.status==='current');
    const configurations=current.filter(x=>x.kind==='configuration').map(x=>({
      ...x,qualification:'Wpis ręcznie oceniony przez użytkownika; nie jest automatycznym dowodem optymalności.'
    }));
    const assumptions=[
      'ENGO oznacza zapotrzebowanie, nie czas pracy palnika.',
      'Historia MQTT może zawierać zmiany wartości zamiast wszystkich próbek.',
      'Gaz może obejmować ogrzewanie, CWU i inne odbiorniki.',
      'Porównuj różne ustawienia dopiero po ocenie pogody, komfortu, zakłóceń i jakości pomiarów.',
      'Nie zmieniaj urządzeń ani nie odtwarzaj odrzuconych eksperymentów bez nowego uzasadnienia.',
      'Wnioski z eksperymentów mogą być negatywne lub nierozstrzygnięte.',
      'Propozycje ChatGPT wymagają przeglądu i jawnej akceptacji użytkownika.',
      'Nie dopowiadaj brakującej charakterystyki mieszkania ani historycznych wyników.',
      'Rozróżniaj wiedzę z publikacji i instrukcji producenta od pomiarów lokalnych; sprawdzaj warunki jej zastosowania.'
    ];
    const knowledge={method:METHOD,primary_goal:GOAL,
      supreme_principle:ETHICS,
      governing_documents:PROJECT_DOCUMENTATION,
      governing_documents_notice:'Powyższe publiczne dokumenty rozwijają zasady i źródła osadzone w raporcie. Jeśli masz dostęp do ich treści, zapoznaj się z nimi przed rekomendacją; jeśli nie, pracuj na wiedzy zawartej w tym pliku i jawnie zaznacz ograniczenie. Sam link nie oznacza, że dokument został przeczytany.',
      established_technical_research:HeatingResearch.exportContext(),
      durable_project_card:card,entire_knowledge_history:history,
      currently_applicable_knowledge:current,
      candidate_configurations_with_conditions:configurations,
      complete_decision_history:decisions,complete_experiment_history:experiments,
      open_problem:card.currentQuestion||null,
      open_hypotheses:current.filter(x=>x.kind==='hypothesis'),
      active_experiments:experiments.filter(x=>x.status==='active'),
      newest_decision:decisions.at(-1)||null,
      rules_and_limits:assumptions,
      source_notice:'Historia i karta pochodzą z prywatnych wpisów użytkownika; ich pewność nie została automatycznie zweryfikowana.',
      continuity_instruction:'W pierwszej kolejności przeczytaj dwa publiczne dokumenty projektu wskazane w governing_documents, jeśli są dostępne. Nie twierdź, że je przeczytałeś, jeżeli nie uzyskałeś dostępu do ich treści; w takim przypadku oprzyj się na zasadach i bazie wiedzy osadzonych w tym raporcie. Odtwórz cel, instalację, ustalenia i wyniki wcześniejszych eksperymentów. Nie wracaj do odrzuconych hipotez bez nowych dowodów. Oddziel fakty od interpretacji, respektuj granice zastosowania i zaproponuj najwyżej jeden uzasadniony następny krok.'};
    // Preserve v1.7 report shape and its period-specific measurements; add full durable context.
    return {...report,format_version:2,memory_context:knowledge,readable_summary:
      report.readable_summary+'\n\n'+summary(knowledge)};
  }
  function summary(context){
    const c=context.durable_project_card;
    const rows=[
      'PAMIĘĆ PROJEKTU — WAŻNA TAKŻE PO ZMIANIE ROZMOWY',
      'DOKUMENTY NACZELNE — PRZECZYTAJ PRZED REKOMENDACJĄ, JEŚLI DOSTĘPNE:',
      ...context.governing_documents.map(doc=>doc.title+': '+doc.url+' / '+doc.purpose),
      'UWAGA: linki odsyłają do pełnych dokumentów; jeśli nie masz do nich dostępu, nie twierdź, że je przeczytałeś. Korzystaj z osadzonych zasad i źródeł.',
      'ZASADA NACZELNA: '+context.supreme_principle.principle,
      'SENS PROJEKTU: '+context.supreme_principle.purpose,
      ...context.supreme_principle.virtues.map(v=>v.name.toUpperCase()+': '+v.definition+' Zastosowanie: '+v.practice),
      'KRYTERIUM DECYZJI: '+context.supreme_principle.decision_test,
      'HIERARCHIA: '+context.supreme_principle.hierarchy,
      'Cel techniczny: '+context.primary_goal,'Metoda: '+context.method,
      'Zewnętrzna baza źródeł: '+context.established_technical_research.sources.length+' zweryfikowanych pozycji. Ich wnioski są hipotezami odniesienia, NIE dowodami działania instalacji.',
      'Charakterystyka mieszkania: '+(c.overview||'NIE WPISANO'),
      'Instalacja: '+(c.installation||'NIE WPISANO'),
      'Źródła danych: '+(c.sensors||'NIE WPISANO'),
      'Komfort i kryteria: '+(c.comfort||'NIE WPISANO'),
      'Ograniczenia: '+(c.constraints||'NIE WPISANO'),
      'Aktualne pytanie: '+(c.currentQuestion||'NIE WPISANO'),
      'Zapisanych wniosków: '+context.entire_knowledge_history.length,
      'Wszystkie decyzje: '+context.complete_decision_history.length,
      'Wszystkie eksperymenty: '+context.complete_experiment_history.length
    ];
    if(context.newest_decision)rows.push('Ostatnia decyzja: '+context.newest_decision.choice+' — '+context.newest_decision.assessment);
    for(const entry of context.currently_applicable_knowledge.slice(-30)){
      rows.push('• '+KINDS[entry.kind]+': '+entry.title+' / '+entry.conclusion+
        ' / warunki: '+(entry.conditions||'nie opisano')+' / pewność: '+CONFIDENCE[entry.confidence]);
    }
    rows.push('ZASADA: nowe oceny muszą wykorzystywać historię wyników; nie wyznaczaj sprawności palnika bez pomiarów.');
    return rows.join('\n');
  }
  const CHAT_INSTRUCTIONS=
    'Przed rekomendacją i eksperymentem zapoznaj się z oboma dokumentami GitHub wymienionymi w memory_context.governing_documents, o ile możesz je otworzyć. Jeśli dostęp jest niemożliwy, powiedz o tym i korzystaj z pełnych danych osadzonych w raporcie. '+
    'Zanim przeanalizujesz ogrzewanie, odczytaj nadrzędną zasadę i cnoty kardynalne z memory_context.supreme_principle. Chodzi o wybór dobra i rozważną realizację, nie o samą redukcję kosztów. '+
    'Wykorzystaj publiczną bazę wiedzy technicznej z raportu jako punkt wyjścia, lecz zawsze oddziel ją od lokalnych dowodów. ' +
    'Analizuj załączony raport „Moje Ogrzewanie” v2 jako samowystarczalny zapis projektu. '+ 
    'Najpierw odtwórz kartę instalacji, wyniki poprzednich eksperymentów, hipotezy odrzucone i ostatnią decyzję. '+
    'Nie powtarzaj zbadanych już prób bez nowych przesłanek. Rozdziel: WIDZIEĆ — fakty i braki danych; '+
    'OCENIĆ — możliwa przyczynowość, komfort i gaz skorygowany o pogodę oraz niepewność; '+
    'DZIAŁAĆ — jeden najrozsądniejszy następny krok, jego uzasadnienie, sposób pomiaru i kryterium sukcesu. '+
    'UCZYĆ SIĘ — proponowany nowy wpis do rejestru wiedzy. Nie wymyślaj pomiarów ani wyników.';
  const PROPOSAL_INSTRUCTIONS=
    'Zaproponuj dla aplikacji Moje Ogrzewanie tylko WNIOSKI POPARTE DANYMI. Zwróć wyłącznie poprawny JSON (bez Markdown): '+
    '{"format":"moje-ogrzewanie-propozycje-wiedzy","version":1,"items":[{"kind":"observation|hypothesis|result|configuration",'+
    '"title":"krótki tytuł","conclusion":"konkretny wniosek","evidence":"dowody, daty i źródła",'+
    '"conditions":"warunki obowiązywania lub ograniczenia","confidence":"low|medium|high",'+
    '"outcome":"none|positive|negative|inconclusive","experimentId":null}]}. '+
    'Dla result wybierz positive/negative/inconclusive; dla innych typów outcome=none. '+ 
    'Nigdy nie deklaruj „optymalnych” ustawień bez wiarygodnego porównania. '+
    'Nie kopiuj ogólnej wiedzy z publikacji do rejestru WYNIKÓW mieszkania bez lokalnego potwierdzenia. '+
    'Nie dopisuj wniosków już obecnych w rejestrze. Maksymalnie pięć propozycji. Użytkownik je oceni przed importem.';
  return {GOAL,METHOD,ETHICS,PROJECT_DOCUMENTATION,CARD_FIELDS,KINDS,CONFIDENCE,OUTCOMES,EMPTY_CARD,parseProposal,createRecord,augment,summary,
    CHAT_INSTRUCTIONS,PROPOSAL_INSTRUCTIONS};
})();
