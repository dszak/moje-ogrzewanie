'use strict';

// The same validator runs in the PWA, Worker and GitHub-side authoring tool.
globalThis.JournalModel = (() => {
 const limits={events:4000, bytes:650000};
 const ids=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{2,99}$/;
 const rooms=['bedroom','salon','kitchen','bigbath','smallbath','hall'];
 const heads=Array.from({length:8},(_,i)=>'G'+(i+1));
 const doors=['bed-hall','kitchen-hall','salon-kitchen','bigbath-hall','smallbath-hall','entrance-hall'];
 const collection={experiment:'experiments',decision:'decisionLog'};
 const bad=(message='Nieprawidłowy zapis dziennika.',status=400)=>{throw Object.assign(Error(message),{status});};
 const conflict=(message='Wpis zmienił się w archiwum.')=>bad(message,409);
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const one=(value,allowed)=>{if(!allowed.includes(value))bad();return value;};
 const id=x=>{if(typeof x!=='string'||!ids.test(x))bad();return x;};
 const text=(value,limit,required=false)=>{
  if(typeof value!=='string'||value.length>limit||required&&!value.trim())bad();
  return value;
 };
 const iso=value=>{
  const time=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(time)||new Date(time).toISOString()!==value)bad();
  return value;
 };
 const nullable=(value,fn)=>value==null?null:fn(value);
 const number=(value,min,max)=>{
  if(!Number.isFinite(value)||value<min||value>max)bad();return value;
 };
 const pickFields=(x,allowed,required=allowed)=>{
  if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(x,k)))bad();
 };
 function canonicalTime(value){
  if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))bad();
  return new Date(Date.parse(value)).toISOString();
 }
 function snapshot(input) {
  pickFields(input,['boiler','engo','engoPlace','radiators','doors','targets','measurements']);
  const map=(values,keys,parse)=>{
   pickFields(values,keys);
   return Object.fromEntries(keys.map(key=>[key,parse(values[key])]));
  };
  return {boiler:number(input.boiler,25,85),engo:number(input.engo,10,30),engoPlace:text(input.engoPlace,220),
   radiators:map(input.radiators,heads,x=>nullable(x,n=>number(n,5,35))),
   doors:map(input.doors,doors,x=>one(x,['unknown','open','ajar','closed'])),
   targets:map(input.targets,rooms,x=>nullable(x,n=>number(n,10,30))),
   measurements:map(input.measurements,rooms,x=>nullable(x,n=>number(n,-10,45)))};
 }
 function gas(input){
  pickFields(input,['at','m3','meter']);
  return {at:iso(input.at),m3:number(input.m3,0,100000000),meter:one(input.meter,['old','new'])};
 }
 function weather(input){
  pickFields(input,['at','c','source']);
  return {at:iso(input.at),c:number(input.c,-90,65),source:text(input.source,80,true)};
 }
 function change(input){
  pickFields(input,['parameter','before','after']);
  const value=x=>x===null?null:typeof x==='number'?number(x,-100000,100000):text(x,120);
  return {parameter:text(input.parameter,120,true),before:value(input.before),after:value(input.after)};
 }
 function experiment(input){
  const required=['title','description','status','started','ended','start','end','notes'];
  const optional=['hypothesis','change','constants','weather','reference','gasStart','gasEnd','results','conclusion','decision','metrics'];
  pickFields(input,[...required,...optional],required);
  const status=one(input.status,['planned','active','done']);
  const started=nullable(input.started,iso),ended=nullable(input.ended,iso);
  if((status==='planned')!==!started||(status==='done')!==!!ended||(ended&&ended<started))bad();
  return {title:text(input.title,100,true),description:text(input.description,1500),status,started,ended,
   start:nullable(input.start,snapshot),end:nullable(input.end,snapshot),notes:text(input.notes,3000),
   hypothesis:text(input.hypothesis??'',1000),change:nullable(input.change,change),
   constants:text(input.constants??'',1000),weather:nullable(input.weather,weather),
   reference:text(input.reference??'',1000),gasStart:nullable(input.gasStart,gas),gasEnd:nullable(input.gasEnd,gas),
   results:text(input.results??'',1800),conclusion:text(input.conclusion??'',1800),decision:text(input.decision??'',1500),
   metrics:text(input.metrics??'',500)};
 }
 function decision(input){
  pickFields(input,['at','periodStart','periodEnd','periodKey','choice','assessment','action','reviewOn','experimentId','settings']);
  const at=iso(input.at),periodStart=iso(input.periodStart),periodEnd=iso(input.periodEnd);
  if(periodEnd<periodStart)bad();
  const reviewOn=nullable(input.reviewOn,value=>{
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))bad();
   iso(value+'T12:00:00.000Z');return value;
  });
  pickFields(input.settings,['boiler','engo']);
  return {at,periodStart,periodEnd,periodKey:one(input.periodKey,['day','week','month']),
   choice:one(input.choice,['keep','observe','experiment']),assessment:text(input.assessment,4000,true),
   action:text(input.action,1500),reviewOn,experimentId:nullable(input.experimentId,id),
   settings:{boiler:nullable(input.settings.boiler,n=>number(n,25,85)),
    engo:nullable(input.settings.engo,n=>number(n,10,30))}};
 }
 function revision(input) {
  pickFields(input,['id','kind','recordId','parent','at','source','op','record']);
  const base={id:id(input.id),kind:one(input.kind,['experiment','decision']),recordId:id(input.recordId),
   parent:nullable(input.parent,id),at:iso(input.at),source:one(input.source,['iphone','chatgpt','migration']),
   op:one(input.op,['upsert','archive'])};
  if(base.op==='archive'){
   if(base.kind!=='decision'||!base.parent||input.record!==null)bad();
   return {...base,record:null};
  }
  return {...base,record:base.kind==='experiment'?experiment(input.record):decision(input.record)};
 }
 const key=e=>e.kind+'|'+e.recordId;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const normalize=value=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 function identity(event){
  if(event.op==='archive')return null;
  const row=event.record;
  if(event.kind==='decision')return JSON.stringify(['decision',row.at,row.choice,normalize(row.assessment)]);
  return JSON.stringify(['experiment',normalize(row.title),row.started?.slice(0,16)??null,
   row.started?null:normalize(row.description)]);
 }
 function replay(events){
  const heads=new Map(),seen=new Map(),identities=new Map();let active=null;
  for(const event of events){
   if(seen.has(event.id)){conflict('Powtórzone zdarzenie w dzienniku.');}
   const k=key(event),old=heads.get(k);
   if((old?.id??null)!==event.parent)conflict();
   if(event.op==='archive'&&old?.op!=='upsert')conflict();
   const signature=identity(event),previousSignature=old&&identity(old);
   if(signature&&identities.has(signature)&&identities.get(signature)!==k)
    conflict('Ten sam wpis znajduje się w archiwum pod innym identyfikatorem.');
   if(previousSignature)identities.delete(previousSignature);
   if(signature)identities.set(signature,k);
   if(event.kind==='experiment'){
    if(event.record.status==='active'&&active&&active!==k)conflict('Istnieje inny aktywny eksperyment.');
    if(active===k)active=null;
    if(event.record.status==='active')active=k;
   }
   if(event.kind==='decision'&&event.record?.experimentId&&!heads.has('experiment|'+event.record.experimentId))
    conflict('Najpierw zapisz powiązany eksperyment.');
   heads.set(k,event);seen.set(event.id,event);
  }
  return {heads,seen};
 }
 const empty=()=>({schema_version:1,events:[]});
 function validate(input){
  pickFields(input,['schema_version','events']);
  if(input.schema_version!==1||!Array.isArray(input.events)||input.events.length>limits.events)bad();
  const result={schema_version:1,events:input.events.map(revision)};
  if(new TextEncoder().encode(JSON.stringify(result)).length>limits.bytes)bad('Osiągnięto limit dziennika.',413);
  replay(result.events);
  return result;
 }
 function append(input,pending){
  const archive=validate(input),{seen}=replay(archive.events);
  const incoming=revision(pending);
  if(seen.has(incoming.id)){
   if(!same(seen.get(incoming.id),incoming))conflict('Identyfikator zapisu użyty dla innej treści.');
   return {archive,added:false};
  }
  archive.events.push(incoming);
  return {archive:validate(archive),added:true};
 }
 function local(kind,x){
  if(kind==='decision'){
   const {at,periodStart,periodEnd,periodKey,choice,assessment,action,reviewOn,experimentId,settings}=x;
   return decision({at:canonicalTime(at),periodStart:canonicalTime(periodStart),periodEnd:canonicalTime(periodEnd),
    periodKey,choice,assessment,action,reviewOn,experimentId,settings});
  }
  return experiment({title:x.title,description:x.description,status:x.status,started:nullable(x.started,canonicalTime),
   ended:nullable(x.ended,canonicalTime),start:x.start??null,end:x.end??null,notes:x.notes??'',
   hypothesis:x.hypothesis,change:x.change,constants:x.constants,weather:x.weather,reference:x.reference,
   gasStart:x.gasStart,gasEnd:x.gasEnd,results:x.results,conclusion:x.conclusion,decision:x.decision,metrics:x.metrics});
 }
 return {limits,collection,id,iso,revision,validate,replay,append,empty,key,same,local,canonicalTime};
})();
