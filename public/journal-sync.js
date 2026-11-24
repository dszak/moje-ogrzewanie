'use strict';

const JournalSync=(()=>{
 const model=JournalModel;
 const api='https://moje-ogrzewanie-gaz-sync.ks-stawarz.workers.dev/v1/journal';
 const tokenPattern=/^[a-f0-9]{48}$/;
 const empty=()=>({version:1,enabled:false,pending:[],held:[],heads:[],conflicts:[],lastAt:null});
 const messages={
  local:'Zapisano na urządzeniu.',pending:'Oczekuje na synchronizację.',
  synced:'Zsynchronizowano z prywatnym archiwum.',conflict:'Wymaga rozwiązania konfliktu.'
 };
 let credential=null,role=null,history=[],running=null,restoring=null,checkedAt=null;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const id=()=>crypto.randomUUID();
 function validateMeta(value){
  if(!value||value.version!==1||typeof value.enabled!=='boolean')throw Error('Nieprawidłowa kopia dziennika.');
  const {enabled,lastAt}=value;
  const events=(rows,max)=>{
   if(!Array.isArray(rows)||rows.length>max)throw Error('Nieprawidłowa kopia dziennika.');
   const result=rows.map(model.revision);
   if(new Set(result.map(row=>row.id)).size!==result.length)throw Error('Powtórzona rewizja w kopii dziennika.');
   return result;
  };
  if(!Array.isArray(value.conflicts)||value.conflicts.length>model.limits.events)throw Error('Nieprawidłowa kopia konfliktów.');
  const conflicts=[...new Set(value.conflicts.map(key=>{
   if(typeof key!=='string'||!/^(experiment|decision)\|/.test(key))throw Error('Nieprawidłowy konflikt.');
   model.id(key.split('|').slice(1).join('|'));return key;
  }))];
  const heads=events(value.heads,model.limits.events);
  if(new Set(heads.map(model.key)).size!==heads.length)throw Error('Powtórzony wpis w kopii dziennika.');
  const pending=events(value.pending,model.limits.events),held=events(value.held,model.limits.events);
  if([...pending,...held].some(event=>event.source!=='iphone'))throw Error('Nieprawidłowe źródło kolejki dziennika.');
  return {version:1,enabled,pending,held,heads,conflicts,lastAt:lastAt===null?null:model.iso(lastAt)};
 }
 const meta=state=>state.journal??empty();
 const forKey=(rows,key)=>rows.filter(e=>model.key(e)===key);
 const latest=(rows,key)=>forKey(rows,key).at(-1);
 function enqueue(state,kind,item,op='upsert'){
  const journal=meta(state);
  const key=kind+'|'+item.id;
  const head=latest(journal.pending,key)??latest(journal.heads,key);
  if(!journal.enabled){
   if(head)throw Error('Połącz dziennik kluczem z prawem zapisu, żeby edytować ten wpis.');
   return false;
  }
  if(journal.conflicts.includes(key))throw Error(messages.conflict);
  if(op==='archive'&&(!head||head.op==='archive'))return false;
  const entry=model.revision({id:id(),kind,recordId:item.id,parent:head?.id??null,
   at:new Date().toISOString(),source:'iphone',op,record:op==='archive'?null:model.local(kind,item)});
  state.journal={...journal,pending:[...journal.pending,entry]};
  return true;
 }
 const entries=(state,kind)=>state[model.collection[kind]];
 function put(state,event){
  const rows=entries(state,event.kind),index=rows.findIndex(item=>item.id===event.recordId);
  if(event.op==='archive'){
   if(index>=0)rows.splice(index,1);
   return;
  }
  const item={id:event.recordId,...copy(event.record)};
  if(event.kind==='experiment'&&item.status==='active'&&rows.some(row=>row.id!==item.id&&row.status==='active'))return false;
  if(index>=0)rows[index]=item;
  else rows.unshift(item);
  return true;
 }
 function matchesLocal(state,event){
  const item=entries(state,event.kind).find(row=>row.id===event.recordId);
  if(!item)return true;
  try{return event.op==='upsert'&&model.same(model.local(event.kind,item),event.record);}
  catch{return false;}
 }
 function reconcile(state,archive,rejected=new Set()){
  const next={...state,experiments:[...state.experiments],decisionLog:[...state.decisionLog]};
  const journal=meta(state),{heads,seen}=model.replay(archive.events);
  const pending=journal.pending.filter(e=>!model.same(seen.get(e.id),e));
  const undone=new Set(pending.map(model.key));
  const known=new Set(journal.heads.map(model.key));
  const conflicts=new Set(rejected);
  for(const event of pending){
   if(seen.has(event.id)&&!model.same(seen.get(event.id),event))conflicts.add(model.key(event));
  }
  for(const [key,event] of heads){
   if(undone.has(key)){
    const first=forKey(pending,key)[0];
    if(first.parent!==event.id)conflicts.add(key);
   }else if(!known.has(key)&&!matchesLocal(next,event))conflicts.add(key);
  }
  const wasLocalOnly=new Set(journal.conflicts.filter(key=>!undone.has(key)&&heads.has(key)));
  for(const key of wasLocalOnly){
   if(!matchesLocal(next,heads.get(key)))conflicts.add(key);
  }
  // Apply completed entries first so closing one experiment can free the active slot.
  const ordered=[...heads.values()].sort((a,b)=>
   Number(a.record?.status==='active')-Number(b.record?.status==='active'));
  for(const event of ordered){
   const key=model.key(event);
   if(!undone.has(key)&&!conflicts.has(key)&&put(next,event)===false)conflicts.add(key);
  }
  next.journal={...journal,pending,heads:[...heads.values()],conflicts:[...conflicts],lastAt:new Date().toISOString()};
  return next;
 }
 function afterRestore(incoming,current){
  const next={...incoming,experiments:[...incoming.experiments],decisionLog:[...incoming.decisionLog]};
  if(!incoming.journal&&!current.journal)return next;
  const journal=meta(current),backup=meta(incoming);
  const present=new Set([...journal.heads,...journal.pending,...journal.held].map(e=>e.id));
  const held=[...journal.held,...[...backup.pending,...backup.held].filter(event=>!present.has(event.id))];
  next.journal={...journal,heads:current.journal?journal.heads:backup.heads,held:[...new Map(held.map(event=>[event.id,event])).values()]};
  const projections=new Map([...(current.journal?journal.heads:backup.heads).filter(e=>!journal.conflicts.includes(model.key(e))),
   ...journal.pending].map(event=>[model.key(event),event]));
  const projected=[...projections.values()].sort((a,b)=>Number(a.record?.status==='active')-Number(b.record?.status==='active'));
  for(const event of projected){
   if(put(next,event)!==false)continue;
   // A restored copy can contain a different active experiment. Keep both available locally.
   if(!next.journal.conflicts.includes(model.key(event)))next.journal.conflicts=[...next.journal.conflicts,model.key(event)];
  }
  return next;
 }
 function candidates(state){
  const journal=meta(state),known=[...journal.heads,...journal.pending];
  const keys=new Set(known.map(model.key));
  const normal=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const result=[];
  for(const kind of ['experiment','decision']){
   for(const item of entries(state,kind)){
    if(keys.has(kind+'|'+item.id))continue;
    const duplicate=known.some(event=>{
     if(event.kind!==kind||!event.record)return false;
     const row=event.record;
     return kind==='experiment'?(normal(item.title)===normal(row.title)||
      (item.started&&row.started&&item.started.slice(0,10)===row.started.slice(0,10)&&
       item.change?.parameter&&normal(item.change.parameter)===normal(row.change?.parameter))):
      (item.at?.slice(0,10)===row.at.slice(0,10)&&item.choice===row.choice);
    });
    result.push({kind,item,duplicate});
   }
  }
  return result;
 }
 function resolve(state,key,keep){
  const journal=meta(state);
  if(!journal.conflicts.includes(key))return false;
  const head=latest(journal.heads,key);
  const queued=latest(journal.pending,key);
  const [kind,recordId]=key.split('|');
  const item=entries(state,kind).find(row=>row.id===recordId);
  if(keep&&(!journal.enabled||!item&&!queued))throw Error('Nie ma lokalnej wersji do wysłania.');
  if(!keep&&!head)throw Error('Brak wersji archiwum dla tego wpisu. Zapis lokalny zachowano.');
  if(!keep&&put(state,head)===false)throw Error('Najpierw rozwiąż sytuację aktywnego eksperymentu.');
  state.journal={...journal,pending:journal.pending.filter(event=>model.key(event)!==key),
   conflicts:journal.conflicts.filter(value=>value!==key)};
  if(keep){
   const draft=item??(queued?.op==='upsert'?{id:recordId,...queued.record}:null);
   enqueue(state,kind,draft??{id:recordId},draft?'upsert':'archive');
  }
  return true;
 }
 function recoverHeld(state){
  const journal=meta(state);
  if(!journal.enabled||!journal.held.length)return false;
  const byId=new Map([...journal.pending,...journal.held].map(event=>[event.id,event]));
  state.journal={...journal,pending:[...byId.values()],held:[]};
  return true;
 }
 async function deviceKey(mode,value){
  if(typeof indexedDB==='undefined')throw Error('Przeglądarka nie może zachować klucza dziennika.');
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('moje-ogrzewanie-journal-device-v1',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('credentials');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('credentials',mode==='get'?'readonly':'readwrite');
   const store=transaction.objectStore('credentials');
   const request=mode==='get'?store.get('journal'):mode==='put'?store.put(value,'journal'):store.delete('journal');
   transaction.oncomplete=()=>resolve(request.result);
   transaction.onabort=()=>reject(transaction.error);
  });}finally{db.close();}
 }
 async function request(method,token,event,transport=fetch){
  const headers={Authorization:'Bearer '+token};
  const settings={method,headers,cache:'no-store',credentials:'omit',redirect:'error',
   signal:AbortSignal.timeout(15000)};
  if(event){
   headers['Content-Type']='application/json';
   settings.body=JSON.stringify(event);
  }
  const response=await transport(api,settings);
  if(!response.ok){
   const message=response.status===401?'Klucz dziennika nie ma wymaganych uprawnień.':
    response.status===409?messages.conflict:'Prywatne archiwum jest chwilowo niedostępne.';
   throw Object.assign(Error(message),{status:response.status});
  }
  const payload=await response.json();
  if(method==='POST'){
   if(payload.ok!==true||payload.id!==event.id)throw Error('Brak potwierdzenia zapisu w archiwum.');
   return;
  }
  if(!['read','write'].includes(payload.role))throw Error('Nieprawidłowa odpowiedź dziennika.');
  return {role:payload.role,archive:model.validate(payload.archive)};
 }
 async function connect(raw,get,commit){
  if(running)return running;
  const token=raw.trim().toLowerCase();
  if(!tokenPattern.test(token))throw Error('Sprawdź klucz dziennika.');
  if(restoring)await restoring;
  if(running)await running;
  running=(async()=>{
   const result=await request('GET',token);
   await deviceKey('put',token);
   const next=reconcile(get(),result.archive);
   next.journal.enabled=result.role==='write';
   commit(next);credential=token;role=result.role;history=result.archive.events;checkedAt=next.journal.lastAt;
  })().finally(()=>{running=null;});
  return running;
 }
 async function init(){
  if(!restoring)restoring=deviceKey('get').then(token=>{if(!credential&&tokenPattern.test(token||''))credential=token;}).catch(()=>{});
  await restoring;
 }
 async function disconnect(get,commit){
  if(running)await running.catch(()=>{});
  await deviceKey('delete');
  credential=null;role=null;history=[];checkedAt=null;
  const state=get();
  if(state.journal)commit({...state,journal:{...state.journal,enabled:false}});
 }
 function sync(get,commit,transport=fetch){
  if(running)return running;
  if(!credential||globalThis.navigator?.onLine===false)return Promise.resolve(false);
  running=(async()=>{
   const token=credential,first=await request('GET',token,null,transport);
   role=first.role;
   const rejected=new Set();
   const remote=model.replay(first.archive.events);
   const journal=meta(get());
   let committed=first;
   if(role==='write'&&journal.enabled&&journal.pending.length){
    for(const e of journal.pending){
     const key=model.key(e);
     if(rejected.has(key)||model.same(remote.seen.get(e.id),e))continue;
     try{await request('POST',token,e,transport);}
     catch(error){
      if(error.status!==409)throw error;
      rejected.add(key);
     }
    }
    // An acknowledgement alone does not remove a pending revision.
    committed=await request('GET',token,null,transport);
   }
   const state=get();
   const next=reconcile(state,committed.archive,rejected);
   if(committed.role==='read')next.journal.enabled=false;
   const stable=state.journal&&model.same({...next.journal,lastAt:null},{...state.journal,lastAt:null});
   const projectionChanged=!model.same(next.experiments,state.experiments)||!model.same(next.decisionLog,state.decisionLog);
   if(!stable||projectionChanged)commit(next);
   history=committed.archive.events;
   checkedAt=next.journal.lastAt;
   return true;
  })().finally(()=>{running=null;});
  return running;
 }
 const revisions=(kind,recordId)=>forKey(history,kind+'|'+recordId);
 return {meta,validateMeta,enqueue,reconcile,afterRestore,candidates,resolve,recoverHeld,init,connect,disconnect,sync,
  revisions,messages,lastChecked:()=>checkedAt,headId:(state,kind,id)=>latest(meta(state).heads,kind+'|'+id)?.id??null,status:()=>({connected:!!credential,role})};
})();
