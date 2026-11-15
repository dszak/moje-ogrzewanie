const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function kit(){
 const ctx=vm.createContext({Date,Intl,Math});
 vm.runInContext(fs.readFileSync('public/research.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('public/memory.js','utf8'),ctx);
 return vm.runInContext('MemoryKit',ctx);
}
function item(title='Testowa hipoteza'){
 return {kind:'hypothesis',title,conclusion:'Przy niskiej temperaturze może pojawić się niedogrzanie łazienki.',
   evidence:'Obserwacja z pliku testowego; niepotwierdzona hipoteza.',
   conditions:'Przy temperaturze na zewnątrz poniżej 0°C.',confidence:'low',outcome:'none',experimentId:null};
}
const proposal=(items)=>JSON.stringify({format:'moje-ogrzewanie-propozycje-wiedzy',version:1,items});

test('proposal parser is strict, deduplicated, never mutates knowledge before confirm',()=>{
 const m=kit(),existing=[m.createRecord(item(),'manual','2024-11-01T10:00:00Z')];
 const parsed=m.parseProposal(proposal([item(),item('Nowe pytanie'),item('Nowe pytanie')]),existing,[]);
 assert.equal(parsed.total,3);
 assert.equal(parsed.duplicates,2);
 assert.equal(parsed.items.length,1);
 assert.equal(existing.length,1);
 assert.equal(parsed.items[0].title,'Nowe pytanie');
 assert.throws(()=>m.parseProposal('{"format":"other","version":1,"items":[]}',[],[]),/formacie/);
 assert.throws(()=>m.parseProposal(proposal([{...item(),kind:'configuration',outcome:'positive'}]),[],[]),/Wynik/);
 assert.throws(()=>m.parseProposal(proposal([{...item(),kind:'result',outcome:'none'}]),[],[]),/wynik|Wynik/i);
 assert.throws(()=>m.parseProposal(proposal([{...item(),experimentId:'missing'}]),[],[]),/nie istnieje/);
 assert.throws(()=>m.parseProposal(proposal(Array.from({length:16},(_,i)=>item('X'+i))),[],[]),/1–15/);
});

test('result record is explicit and can be negative or inconclusive without falsely declaring benefit',()=>{
 const m=kit();
 const negative=m.createRecord({...item('Ustawienie 49°C'),kind:'result',outcome:'negative',
   evidence:'Syntetyczny test: zimniejszy pokój, brak poprawy kosztów'},'chatgpt-reviewed','2024-11-02T11:00:00.000Z');
 assert.equal(negative.status,'current');
 assert.equal(negative.outcome,'negative');
 assert.equal(negative.source,'chatgpt-reviewed');
 assert.ok(negative.id.startsWith('wiedza-'));
 const inconclusive=m.createRecord({...item('Test bez pomiarów'),kind:'result',outcome:'inconclusive'});
 assert.equal(inconclusive.outcome,'inconclusive');
});

test('full memory context survives report period boundaries, includes superseded and negative evidence',()=>{
 const m=kit(),oldDate='2024-01-10T12:00:00.000Z';
 const d={id:'decision-one',at:oldDate,periodStart:'2024-01-09T12:00:00Z',periodEnd:oldDate,
   periodKey:'day',choice:'keep',assessment:'Nie zmieniaj ustawień przed pomiarami.',action:'Czekaj na gazomierz.',
   reviewOn:'2024-01-18',experimentId:null,settings:{boiler:55,engo:22}};
 const x={id:'exp-old',title:'Test 49°C',description:'Jedna zmienna',status:'done',
   started:'2024-01-01T10:00:00Z',ended:'2024-01-05T10:00:00Z',
   start:{boiler:55,engo:22},end:{boiler:49,engo:22},notes:'Niepowodzenie.'};
 const fact=m.createRecord(item('Dawna hipoteza'),'manual',oldDate);
 fact.id='fact-1';fact.status='superseded';
 const outcome=m.createRecord({...item('Negatywny wynik 49°C'),kind:'result',outcome:'negative',
   experimentId:'exp-old',evidence:'Wcześniejszy eksperyment nie dał oszczędności.'},'manual',oldDate);
 const state={projectMemory:{overview:'Prywatna charakterystyka testowa',
   installation:'Kocioł testowy i dwa grzejniki',sensors:'Czujniki testowe',comfort:'Ważne: komfort',
   constraints:'Ograniczenia testowe',currentQuestion:'Czy 52°C to dobra temperatura?',updatedAt:oldDate},
   knowledgeLog:[fact,outcome],decisionLog:[d],experiments:[x],
   privateMap:'SECRET_PRIVATE_MAP',events:[{detail:'SECRET_PERSONAL_EVENT'}],secretToken:'SECRET_TOKEN'};
 const report={format:'moje-ogrzewanie-analiza',format_version:1,created_at:'2024-11-15T10:00:00Z',
   readable_summary:'Pomiary z 24 godzin',period:{key:'day'}};
 const out=m.augment(report,state),full=out.memory_context;
 assert.equal(out.format_version,2);
 assert.equal(full.established_technical_research.sources.length,9);
 assert.ok(full.established_technical_research.sources.some(s=>s.id==='nesta'));
 assert.equal(full.entire_knowledge_history.length,2);
 assert.equal(full.entire_knowledge_history[0].status,'superseded');
 assert.equal(full.entire_knowledge_history[1].outcome,'negative');
 assert.equal(full.complete_decision_history.length,1);
 assert.equal(full.complete_experiment_history.length,1);
 assert.equal(full.newest_decision.assessment,'Nie zmieniaj ustawień przed pomiarami.');
 assert.equal(full.open_problem,'Czy 52°C to dobra temperatura?');
 assert.match(out.readable_summary,/PAMIĘĆ PROJEKTU/);
 assert.match(out.readable_summary,/Pomiary z 24 godzin/);
 assert.deepEqual(report,{format:'moje-ogrzewanie-analiza',format_version:1,created_at:'2024-11-15T10:00:00Z',
   readable_summary:'Pomiary z 24 godzin',period:{key:'day'}},'source report untouched');
 const text=JSON.stringify(out);
 assert.ok(!text.includes('SECRET_PRIVATE_MAP'));
 assert.ok(!text.includes('SECRET_PERSONAL_EVENT'));
 assert.ok(!text.includes('SECRET_TOKEN'));
});

test('current configuration candidates are not silently called optimal',()=>{
 const m=kit(),state={projectMemory:m.EMPTY_CARD(),knowledgeLog:[
   m.createRecord({...item('Próba 55°C'),kind:'configuration',conclusion:'Pomiary tylko w mroźny dzień.',
      evidence:'Testowy pomiar',confidence:'low'},'manual','2024-10-01T00:00:00Z')
 ],experiments:[],decisionLog:[]};
 const r=m.augment({readable_summary:'Bazowy raport'},state);
 assert.equal(r.memory_context.candidate_configurations_with_conditions.length,1);
 assert.match(r.memory_context.candidate_configurations_with_conditions[0].qualification,/nie jest automatycznym dowodem/);
 assert.equal(r.memory_context.currently_applicable_knowledge.length,1);
 assert.equal(r.memory_context.durable_project_card.currentQuestion,'');
});

test('new chat and evidence proposal prompts explicitly forbid invented facts and repeating old attempts',()=>{
 const m=kit();
 assert.match(m.CHAT_INSTRUCTIONS,/publiczną bazę wiedzy technicznej/);
 assert.match(m.CHAT_INSTRUCTIONS,/Nie powtarzaj zbadanych już prób/);
 assert.match(m.CHAT_INSTRUCTIONS,/Nie wymyślaj pomiarów/);
 assert.match(m.PROPOSAL_INSTRUCTIONS,/tylko WNIOSKI POPARTE DANYMI/);
 assert.match(m.PROPOSAL_INSTRUCTIONS,/propozycje-wiedzy/);
});


test('technical research is sourced, clearly separate from household results, and exported with limitations',()=>{
 const ctx=vm.createContext({Date,Intl,Math});
 vm.runInContext(fs.readFileSync('public/research.js','utf8'),ctx);
 const library=vm.runInContext('HeatingResearch',ctx);
 const exported=library.exportContext();
 assert.equal(exported.sources.length,9);
 assert.ok(exported.classification.includes('NIE WYNIK POMIARÓW'));
 assert.equal(exported.potential_diagnostic_tracks.length,4);
 for(const source of exported.sources){
   assert.match(source.url,/^https:\/\//);
   assert.ok(source.finding.length>25);
   assert.ok(source.meaning.length>25);
   assert.ok(source.limit.length>25);
   assert.ok(source.level.length>10);
 }
 const sources=new Set(exported.sources.map(s=>s.id));
 for(const topic of exported.potential_diagnostic_tracks){
   assert.ok(topic.evidence.length>0);
   for(const id of topic.evidence)assert.ok(sources.has(id));
 }
 assert.equal(exported.sources.find(s=>s.id==='engo').topic,'Sterownik ENGO E901WiFi');
 assert.ok(!JSON.stringify(exported).includes('Kilińskiego'));
 assert.ok(!JSON.stringify(exported).includes('15/4'));
 assert.match(exported.instruction,/hipotezy/);
});


test('v1.8.1: governing moral principles preserve the four cardinal virtues and concrete stewardship duties',()=>{
 const m=kit();
 const virtues=m.ETHICS.virtues;
 assert.equal(virtues.length,4);
 assert.deepEqual(Array.from(virtues,x=>x.name),['Roztropność','Sprawiedliwość','Umiarkowanie','Męstwo']);
 assert.match(m.ETHICS.principle,/powierzonym mi dobrem/);
 assert.match(m.ETHICS.purpose,/wybierać dobro/);
 assert.match(virtues[0].definition,/właściwy sposób jego osiągnięcia/);
 assert.match(virtues[1].definition,/każdemu to, co mu się należy/);
 for(const item of ['Bogu','sobie','gościom','ORLENOWI','budynek','przyrodę']){
   assert.ok(JSON.stringify(virtues[1]).toLowerCase().includes(item.toLowerCase()),item);
 }
 assert.match(virtues[2].definition,/panować nad pragnieniami/i);
 assert.match(virtues[3].definition,/wytrwałość w dążeniu do dobra/i);
 assert.match(m.ETHICS.decision_test,/Jakie dobro/);
 assert.match(m.ETHICS.note,/znaczenie moralne/);
});

test('v1.8.1: moral foundation is exported for a fresh chat without changing user data or research evidence',()=>{
 const m=kit();
 const state={projectMemory:{...m.EMPTY_CARD(),overview:'Personal test card'},
   knowledgeLog:[],decisionLog:[],experiments:[]};
 const original=JSON.stringify(state);
 const report=m.augment({readable_summary:'Last period temperatures'},state);
 assert.equal(JSON.stringify(state),original);
 assert.equal(report.format_version,2);
 assert.equal(report.memory_context.supreme_principle.principle,m.ETHICS.principle);
 assert.equal(report.memory_context.supreme_principle.virtues.length,4);
 assert.equal(report.memory_context.durable_project_card.overview,'Personal test card');
 assert.match(report.readable_summary,/ZASADA NACZELNA/);
 assert.match(report.readable_summary,/SPRAWIEDLIWOŚĆ/);
 assert.match(m.CHAT_INSTRUCTIONS,/nadrzędną zasadę/i);
 assert.equal(report.memory_context.established_technical_research.sources.length,9);
});
