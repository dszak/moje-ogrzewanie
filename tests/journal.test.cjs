const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {webcrypto}=require('node:crypto');

require('../public/journal-model.js');
const model=globalThis.JournalModel;
const at='2026-11-01T12:00:00.000Z';
const fixture=(id='test-one',extra={})=>({
 id,kind:'experiment',recordId:'record-one',parent:null,source:'chatgpt',at,op:'upsert',
 record:{title:'Próba syntetyczna',description:'Dane testowe',status:'planned',started:null,ended:null,
  start:null,end:null,notes:''},...extra
});
const body=event=>JSON.stringify(event);
const project=rows=>({experiments:rows.map(row=>({id:row.recordId,...row.record})),decisionLog:[]});
const json=x=>JSON.parse(JSON.stringify(x));

test('journal keeps lifecycle, physical dates, source and revision time with idempotent replay',()=>{
 const first=fixture(),step=model.append(model.empty(),first);
 assert.equal(step.added,true);
 const next=fixture('test-two',{parent:first.id,source:'iphone',
  record:{...first.record,status:'active',started:'2026-11-01T11:55:00.000Z'}});
 const second=model.append(step.archive,next).archive;
 const last=fixture('test-three',{parent:next.id,source:'iphone',
  record:{...next.record,status:'done',ended:'2026-11-01T13:00:00.000Z',conclusion:'Ocena syntetyczna'}});
 const archive=model.append(second,last).archive;
 assert.equal(archive.events[0].record.status,'planned');
 assert.equal(archive.events[1].record.started,'2026-11-01T11:55:00.000Z');
 assert.equal(archive.events[1].at,at);
 assert.equal(model.replay(archive.events).heads.get('experiment|record-one').record.status,'done');
 assert.equal(model.append(archive,next).added,false);
 assert.throws(()=>model.append(archive,{...last,at:'2026-11-02T12:00:00.000Z'}),{status:409});
 assert.throws(()=>model.append(archive,{...fixture('test-four'),parent:first.id}),{status:409});
 assert.throws(()=>model.append(step.archive,fixture('test-five',{recordId:'same-under-another-id'})),{status:409});
});

test('decisions link to real experiments and archive through a tombstone',()=>{
 const first=fixture(),record={at,periodStart:at,periodEnd:at,periodKey:'day',choice:'observe',
  assessment:'Syntetyczna ocena',action:'',reviewOn:null,experimentId:first.recordId,settings:{boiler:null,engo:null}};
 const decision={id:'decision-one',kind:'decision',recordId:'decision-record',parent:null,
  source:'chatgpt',at,op:'upsert',record};
 assert.throws(()=>model.append(model.empty(),decision),{status:409});
 const initial=model.append(model.append(model.empty(),first).archive,decision).archive;
 const last={...decision,id:'decision-archived',parent:decision.id,op:'archive',record:null};
 const archive=model.append(initial,last).archive;
 assert.equal(archive.events[1].record.assessment,record.assessment);
 assert.equal(model.replay(archive.events).heads.get('decision|decision-record').op,'archive');
 assert.throws(()=>model.append(archive,{...last,id:'decision-archive-twice',parent:last.id}),{status:409});
});

function client(){
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder});
 vm.runInContext(readFileSync('public/journal-model.js','utf8')+'\n'+readFileSync('public/journal-sync.js','utf8'),ctx);
 return vm.runInContext('JournalSync',ctx);
}
test('offline queue survives old restore, already observed revisions are not resent, and local history is preserved',()=>{
 const sync=client(),first=fixture(),archive=model.append(model.empty(),first).archive;
 const old=project([fixture('old-local',{recordId:'local-przed-zapisem',record:{...first.record,title:'Poprzednia próba'}})]);
 let state=sync.reconcile(old,archive);state.journal.enabled=true;
 const entry=state.experiments.find(x=>x.id===first.recordId);
 entry.description='Nowy zapis wyłącznie lokalny';
 sync.enqueue(state,'experiment',entry);
 const pending=state.journal.pending[0];
 assert.equal(pending.parent,first.id);
 const restored=sync.afterRestore(old,state);
 assert.equal(restored.journal.pending.length,1);
 assert.equal(restored.experiments.find(x=>x.id===entry.id).description,entry.description);
 assert.equal(restored.experiments.length,2);
 assert.equal(sync.reconcile(restored,archive).journal.pending.length,1);
 const updated=model.append(archive,json(pending)).archive;
 assert.equal(sync.reconcile(restored,updated).journal.pending.length,0);
 const fresh=sync.afterRestore(state,old);
 assert.equal(fresh.journal.pending.length,0);
 assert.equal(fresh.journal.held.length,1);
});
test('concurrent edit preserves offline revision and offers explicit resolution against latest head',()=>{
 const sync=client(),first=fixture(),archive=model.append(model.empty(),first).archive;
 const state=sync.reconcile(project([]),archive);state.journal.enabled=true;
 state.experiments[0].description='Wersja lokalna';
 sync.enqueue(state,'experiment',state.experiments[0]);
 const theirs=fixture('their-revision',{parent:first.id,record:{...first.record,description:'Wersja z archiwum'}});
 const both=model.append(archive,theirs).archive;
 const conflict=sync.reconcile(state,both);
 assert.deepEqual(json(conflict.journal.conflicts),['experiment|record-one']);
 assert.equal(conflict.experiments[0].description,'Wersja lokalna');
 assert.equal(conflict.journal.pending.length,1);
 assert.equal(sync.resolve(conflict,'experiment|record-one',true),true);
 assert.equal(conflict.journal.pending.length,1);
 assert.equal(conflict.journal.pending[0].parent,theirs.id);
 const reconciled=sync.reconcile(conflict,model.append(both,json(conflict.journal.pending[0])).archive);
 assert.equal(reconciled.experiments[0].description,'Wersja lokalna');
 assert.equal(reconciled.journal.pending.length,0);
});

test('Worker isolates permissions, retries GitHub CAS for unrelated writes and refuses conflicting or public data',async()=>{
 const {createJournalHandler,digest}=await import('../sync-worker/journal.mjs');
 const read='a'.repeat(48),write='b'.repeat(48);
 const origin='https://example.test';
 const env={ALLOWED_ORIGIN:origin,JOURNAL_GITHUB_TOKEN:'fixture',
  JOURNAL_READ_TOKEN_SHA256:await digest(read),JOURNAL_WRITE_TOKEN_SHA256:await digest(write)};
 let archive=model.append(model.empty(),fixture()).archive,privateRepo=true,writes=0,sha='1'.repeat(40),race=true;
 const transport=async(url,options)=>{
  if(url.endsWith('archiwum'))return Response.json({full_name:'dszak/moje-ogrzewanie-archiwum',
   private:privateRepo,visibility:privateRepo?'private':'public',archived:false});
  if(options.method!=='PUT')return Response.json({sha,type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(archive)).toString('base64')});
  writes++;
  const payload=JSON.parse(options.body);
  assert.equal(payload.branch,'fixture-only');
  assert.equal(payload.sha,sha);
  if(race){
   race=false;sha='2'.repeat(40);
   archive=model.append(archive,fixture('unrelated-change',{recordId:'unrelated-record',
    record:{...fixture().record,title:'Inny zapis'}})).archive;
   return new Response(null,{status:409});
  }
  archive=JSON.parse(Buffer.from(payload.content,'base64').toString());
  return Response.json({});
 };
 const handler=createJournalHandler({branch:'fixture-only',transport});
 const req=(method,token,entry,from=origin)=>handler(new Request(origin+'/v1/journal',{method,
  headers:{origin:from,authorization:'Bearer '+token,'content-type':'application/json'},...(entry?{body:body(entry)}:{})}),env);
 const phone=fixture('from-phone',{source:'iphone',parent:'test-one',record:{...fixture().record,description:'Wersja telefonu'}});
 assert.equal((await req('GET',read)).status,200);
 assert.equal((await req('GET',write,undefined,'https://another.test')).status,403);
 assert.equal((await req('POST',read,phone)).status,401);
 assert.equal((await req('POST',write,fixture())).status,400);
 assert.equal((await req('POST',write,phone)).status,200);
 assert.equal(writes,2);
 assert.equal(archive.events.length,3);
 assert.equal((await req('POST',write,phone)).status,200);
 assert.equal(writes,2);
 assert.equal((await req('POST',write,{...phone,id:'stale-version'})).status,409);
 privateRepo=false;
 assert.equal((await req('POST',write,phone)).status,502);
 assert.equal((await req('GET',read)).status,502);
 assert.equal(writes,2);
});

test('candidate Worker delegates the existing gas route unchanged',async()=>{
 const original=(await import('../sync-worker/gas-pr27.mjs')).default;
 const candidate=(await import('../sync-worker/worker.mjs')).default;
 const request=()=>new Request('https://example.test/v1/gas',{headers:{origin:'https://example.test'}});
 const env={ALLOWED_ORIGIN:'https://example.test'};
 const [a,b]=await Promise.all([original.fetch(request(),env),candidate.fetch(request(),env)]);
 assert.deepEqual([b.status,[...b.headers],await b.text()],[a.status,[...a.headers],await a.text()]);
});
