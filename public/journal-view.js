'use strict';

const JournalView=(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=HeatingBoard.when;
 const fullDate=new Intl.DateTimeFormat('pl-PL',{
  timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'medium'
 });
 const when=value=>value?fullDate.format(new Date(value)):'—';
 const temp=value=>Number.isFinite(value)?value.toLocaleString('pl-PL')+'°C':'—';
 const button=(label,action,id='',style='ghost')=>
  '<button type="button" class="action '+style+'" data-action="'+action+'" data-id="'+escape(id)+'">'+label+'</button>';
 const sources={iphone:'Aplikacja',chatgpt:'ChatGPT',migration:'Migracja'};
 function revisions(kind,id){
  const rows=JournalSync.revisions(kind,id);
  if(!rows.length)return '';
  return '<details><summary>Historia zmian</summary><ul>'+[...rows].reverse().map((row,index)=>
   '<li>'+escape(when(row.at))+' · '+sources[row.source]+
   (row.op==='archive'?' · archiwizacja':index===rows.length-1?' · utworzenie':' · korekta')+
   (row.record?'<p>'+escape(row.kind==='experiment'?
    [row.record.title,row.record.notes,row.record.results,row.record.conclusion,row.record.decision].filter(Boolean).join(' · '):
    [row.record.assessment,row.record.action].filter(Boolean).join(' · '))+'</p>':'')+'</li>').join('')+'</ul></details>';
 }
 function versionDetails(label,row,at){
  if(!row)return '<p class="hint">'+label+' · Zarchiwizowany</p>';
  const detail=row.title?[row.description,row.hypothesis,row.change&&[
   row.change.parameter,row.change.before??'—','→',row.change.after??'—'].join(' '),
   row.constants,row.metrics,row.reference,row.notes,row.results,row.conclusion,row.decision]:
   [row.assessment,row.action,row.reviewOn&&'Ponowna ocena '+row.reviewOn];
  const period=row.started?[when(row.started),row.ended&&when(row.ended)].filter(Boolean).join(' → '):'';
  return '<details><summary>'+label+(at?' · '+escape(when(at)):'')+'</summary>'+
   (period?'<p class="hint">'+escape(period)+'</p>':'')+
   detail.filter(Boolean).map(value=>'<p>'+escape(value)+'</p>').join('')+'</details>';
 }
 function syncCard(state,message,withMigration=false){
  const journal=JournalSync.meta(state),connection=JournalSync.status(),m=JournalSync.messages;
  const status=journal.conflicts.length?m.conflict:journal.pending.length?m.pending:
   message||(connection.connected&&journal.lastAt?m.synced:'Dziennik jest dostępny na tym urządzeniu.');
  const conflicts=journal.conflicts.map(key=>{
   const remote=journal.heads.find(event=>JournalModel.key(event)===key);
   const [kind,id]=key.split('|'),local=state[JournalModel.collection[kind]].find(item=>item.id===id);
   const queued=journal.pending.filter(event=>JournalModel.key(event)===key).at(-1);
   const draft=local??queued?.record;
   const decision=draft?.assessment??remote?.record?.assessment;
   return '<div class="item"><b>'+escape(draft?.title??remote?.record?.title??decision?.slice(0,100)??'Wpis dziennika')+'</b>'+
    versionDetails('Wersja lokalna',draft,queued?.at)+
    (remote?versionDetails('Wersja w archiwum',remote.record,remote.at):
     '<p class="hint">Sprawdź powiązany eksperyment lub zakończ rozpoczętą próbę.</p>')+
    '<div class="actions">'+(remote?button('Przyjmij wersję z archiwum','journal-remote',key):'')+
    (journal.enabled?button('Zachowaj moją wersję','journal-local',key):'')+'</div></div>';
  }).join('');
  const migrate=withMigration&&journal.enabled?JournalSync.candidates(state):[];
  return '<section class="card"><h3>Synchronizacja dziennika</h3><p data-journal-status role="status">'+escape(status)+'</p>'+
   (journal.lastAt?'<p class="hint">Ostatnia synchronizacja · '+escape(date(JournalSync.lastChecked()??journal.lastAt))+'</p>':'')+
   (journal.pending.length&&message&&message!==m.pending&&message!==m.synced?'<p class="hint">'+escape(message)+'</p>':'')+conflicts+
   '<details><summary>Połączenie z prywatnym archiwum</summary>'+
   (connection.connected?'<p class="hint">'+(connection.role==='read'?'Klucz pozwala odczytywać archiwum.':'Wpisy z tego urządzenia będą przesyłane automatycznie.')+'</p>'+
    '<div class="actions">'+button('Sprawdź teraz','journal-refresh')+button('Zapomnij klucz','journal-disconnect')+'</div>':
    '<label for="journalToken">Klucz dziennika</label><input id="journalToken" type="password" autocapitalize="none" spellcheck="false" autocomplete="off" maxlength="48">'+
    '<div class="actions">'+button('Połącz','journal-connect','','')+'</div>')+'</details>'+
   (journal.held.length?'<p class="hint">W kopii odzyskano '+journal.held.length+' zapisów oczekujących na sprawdzenie.</p>'+
    button('Sprawdź zapisy z kopii','journal-held'):'')+
   (migrate.length?'<details><summary>Wpisy zapisane przed połączeniem</summary>'+
    '<p class="hint">Sprawdź, czy dany wpis ma już odpowiednik w archiwum.</p>'+migrate.map(({kind,item,duplicate})=>
     '<div class="item"><b>'+escape(item.title||item.assessment)+'</b><p class="hint">'+
     escape(date(item.started??item.at))+'</p>'+(duplicate?'<p class="hint">Możliwy odpowiednik w archiwum. Ten wpis pozostaje lokalnie.</p>':
      button('Dołącz do dziennika','journal-migrate',kind+'|'+item.id))+'</div>').join('')+'</details>':'')+'</section>';
 }
 const field=(id,label,value,max,type='text')=>
  '<div class="wide"><label for="'+id+'">'+label+'</label>'+
  (type==='textarea'?'<textarea id="'+id+'" maxlength="'+max+'" rows="2">'+escape(value)+'</textarea>':
   '<input id="'+id+'" type="'+type+'" value="'+escape(value)+'" maxlength="'+max+'"'+(type==='datetime-local'?' step="1"':'')+'>')+'</div>';
 function form(row){
  const edit=!!row;
  return '<section class="card" id="experimentForm"><h3>'+ (edit?'Edytuj eksperyment':'Nowy eksperyment')+
   '</h3><div class="form-grid">'+
   field('expTitle','Nazwa eksperymentu',row?.title,100)+
   field('expDescription','Cel i opis',row?.description,1500,'textarea')+
   '</div><details><summary>Szczegóły próby</summary><div class="form-grid">'+
   field('expHypothesis','Hipoteza',row?.hypothesis,1000,'textarea')+
   field('expParameter','Zmieniany parametr',row?.change?.parameter,120)+
   field('expBefore','Wartość wcześniej',row?.change?.before,120)+
   field('expAfter','Wartość po zmianie',row?.change?.after,120)+
   field('expConstants','Warunki bez zmian',row?.constants,1000,'textarea')+
   field('expMetrics','Mierzone wskaźniki',row?.metrics,500)+
   field('expReference','Dane odniesienia',row?.reference,1000,'textarea')+
   (row?.status==='active'||row?.status==='done'?
    field('expEditStarted','Rzeczywisty początek · czas polski',HeatingBoard.local(row.started, true),19,'datetime-local'):'')+
   (row?.status==='done'?
    field('expEditEnded','Rzeczywisty koniec · czas polski',HeatingBoard.local(row.ended,true),19,'datetime-local')+
    field('expEditNotes','Notatki z obserwacji',row.notes,3000,'textarea')+
    field('expResults','Wyniki pomiarów',row.results,1800,'textarea')+
    field('expConclusion','Wnioski',row.conclusion,1800,'textarea')+
    field('expDecision','Podjęta decyzja',row.decision,1500,'textarea'):'')+
   '</div></details><div class="actions">'+
   (edit?button('Zapisz poprawkę','exp-save',row.id,'')+button('Anuluj','exp-cancel'):
    button('Zapisz plan','plan-exp')+button('Rozpocznij teraz','start-exp','',''))+'</div></section>';
 }
 function card(row,showStart){
  const summary=row.start?'Kocioł '+temp(row.start.boiler)+' · ENGO '+temp(row.start.engo)+
   (row.start.engoPlace?' · '+row.start.engoPlace:''):'Brak migawki ustawień.';
  const attrs=[
   ['Hipoteza',row.hypothesis],['Zmiana',row.change&&row.change.parameter+' · '+(row.change.before??'—')+' → '+(row.change.after??'—')],
   ['Bez zmian',row.constants],['Mierzone wskaźniki',row.metrics],['Pogoda',row.weather&&temp(row.weather.c)+' · '+date(row.weather.at)],
   ['Odniesienie',row.reference],['Gaz na początku',row.gasStart&&HeatingViews.formatGas(row.gasStart.m3)+' · '+date(row.gasStart.at)],
   ['Gaz na końcu',row.gasEnd&&HeatingViews.formatGas(row.gasEnd.m3)+' · '+date(row.gasEnd.at)],
   ['Wyniki',row.results],['Wnioski',row.conclusion],['Decyzja',row.decision]
  ];
  return '<article class="item"><h4>'+escape(row.title)+'</h4>'+
   (row.started?'<p class="hint">'+escape(when(row.started))+(row.ended?' → '+escape(when(row.ended)):'')+'</p>':'')+
   (row.description?'<p>'+escape(row.description)+'</p>':'')+
   (row.started?'<p class="note">Na początku · '+escape(summary)+'</p>':'')+
   (row.end?'<p class="hint">Na końcu · kocioł '+temp(row.end.boiler)+' · ENGO '+temp(row.end.engo)+
    (row.end.engoPlace?' · '+escape(row.end.engoPlace):'')+'</p>':'')+
   (row.notes?'<p>'+escape(row.notes)+'</p>':'')+
   attrs.filter(([,value])=>value).map(([label,value])=>'<p class="hint"><b>'+label+'</b> · '+escape(value)+'</p>').join('')+
   revisions('experiment',row.id)+
   (row.status==='active'?'<div class="form-grid">'+field('finishNotes','Obserwacje i wnioski',row.notes,3000,'textarea')+'</div>':'')+
   '<div class="actions">'+button('Edytuj','exp-edit',row.id)+
   (showStart?button('Rozpocznij teraz','activate-exp',row.id,''):'')+
   (row.status==='active'?button('Zakończ próbę','finish-exp',row.id,''):'')+'</div></article>';
 }
 function render(state,editing,message){
  const entries=state.experiments;
  const active=entries.find(row=>row.status==='active'),edit=entries.find(row=>row.id===editing);
  const planned=entries.filter(row=>row.status==='planned'),done=entries.filter(row=>row.status==='done')
   .sort((a,b)=>Date.parse(b.ended)-Date.parse(a.ended));
  return '<div class="section-head"><div><h2>Eksperymenty</h2><p>Jedna zmiana i obserwacja jej efektu.</p></div></div>'+
   '<div class="stack">'+(active?'<section class="card"><h3>Trwający eksperyment</h3>'+card(active,false)+'</section>':'')+
   (edit||!active?form(edit):'')+
   (planned.length?'<section class="card"><h3>Zaplanowane</h3>'+planned.map(row=>card(row,!active)).join('')+'</section>':'')+
   '<section class="card"><h3>Zakończone</h3>'+(done.length?done.map(row=>card(row,false)).join(''):
    '<p class="hint">Nie ma jeszcze zakończonych eksperymentów.</p>')+'</section>'+syncCard(state,message,true)+'</div>';
 }
 return {render,syncCard,revisions};
})();
