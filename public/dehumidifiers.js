'use strict';
const Dehumidifiers = (() => {
 const rooms={
  smallbath:{name:'Mała łazienka',model:'OL12-BD031M'},
  bigbath:{name:'Duża łazienka',model:'D015B-12L'}
 };
 const minute=60000,day=1440*minute;
 const gap=12*minute,humidityGap=30*minute;
 const fields=['temperature','humidity','relay','power','energy'];

 function sample(field,row,stamp) {
  if(!row||typeof row!=='object')throw Error('Nieprawidłowy pomiar łazienki.');
  const value=row.value;
  const bounds={temperature:[-20,65],humidity:[0,100],power:[0,4000],energy:[0,Infinity]};
  const valid=value===null||(field==='relay'?['on','off'].includes(value):
   Number.isFinite(value)&&value>=bounds[field][0]&&value<=bounds[field][1]);
  if(!valid)throw Error('Nieprawidłowa wartość pomiaru łazienki.');
  return {at:stamp(row.at),value};
 }

 function validate(data,stamp){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Nieprawidłowe dane łazienek.');
  const result={};
  for(const [roomId,room] of Object.entries(data)){
   if(!Object.hasOwn(rooms,roomId)||!room?.latest||!room?.history)
    throw Error('Nieznane pomieszczenie lub niepełny pomiar łazienki.');
   const latest={},history={};
   for(const field of Object.keys(room.history)){
    if(!fields.includes(field)||!Array.isArray(room.history[field])||room.history[field].length>9000)
     throw Error('Nieprawidłowa seria pomiarów łazienki.');
    const rows=room.history[field].map(row=>sample(field,row,stamp));
    if(rows.some((row,i)=>i>0&&row.at<=rows[i-1].at))throw Error('Niejednoznaczna kolejność odczytów.');
    history[field]=rows;
   }
   for(const [field,row] of Object.entries(room.latest)){
    if(!fields.includes(field))throw Error('Nieznany pomiar łazienki.');
    latest[field]=row===null?null:sample(field,row,stamp);
   }
   result[roomId]={latest,history};
  }
  return result;
 }

 function pairs(rows,limit,start,end){
  const out=[];
  for(let i=1;i<rows.length;i++){
   const a=rows[i-1],b=rows[i],from=Date.parse(a.at),to=Date.parse(b.at);
   if(a.value===null||b.value===null||from<start||to>end||to<=from||to-from>limit)continue;
   out.push({from,to,a:a.value,b:b.value});
  }
  return out;
 }

 function duration(rows){return rows.reduce((n,r)=>n+r.to-r.from,0);}

 function analyze(history={},days=7,now=Date.now()){
  const start=now-days*day;
  const edges=pairs(history.relay||[],gap,start,now);
  const relay=edges.filter(p=>p.a===p.b);
  const power=pairs(history.power||[],gap,start,now);
  const meters=pairs(history.energy||[],gap,start,now).filter(p=>p.b>=p.a);
  const drops=[];
  const humidity=history.humidity||[];
  for(const [index,edge] of edges.entries()){
   if(edge.a!=='off'||edge.b!=='on')continue;
   const before=humidity.findLast(h=>h.value!==null&&Date.parse(h.at)<=edge.from&&Date.parse(h.at)>=edge.to-humidityGap);
   const after=humidity.find(h=>h.value!==null&&Date.parse(h.at)>=edge.to+humidityGap&&Date.parse(h.at)<=edge.to+60*minute);
   if(!before||!after)continue;
   const until=Date.parse(after.at);
   // Keep after-samples only while the same observed relay interval continues.
   let covered=edge.to;
   for(const next of edges.slice(index+1)){
    if(next.from!==covered||next.a!=='on'||next.b!=='on')break;
    covered=next.to;
    if(covered>=until)break;
   }
   if(covered>=until)drops.push({before,after,at:edge.to,change:after.value-before.value});
  }
  return {start,end:now,relay,onMs:duration(relay.filter(p=>p.a==='on')),knownMs:duration(relay),
   humidity, power:history.power||[],drops,energy:meters.length?
    {value:meters.reduce((sum,p)=>sum+p.b-p.a,0),ms:duration(meters),estimated:false}:
    power.length?{value:power.reduce((sum,p)=>sum+(p.a+p.b)/2*(p.to-p.from)/3600000000,0),
     ms:duration(power),estimated:true}:null};
 }

 return {rooms,validate,analyze,pairs,gap,humidityGap};
})();
