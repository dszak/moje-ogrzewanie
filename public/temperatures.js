'use strict';
// Home Assistant MQTT temperature-history CSV import. No external data uploads.
const TemperatureHistory=(()=>{
  const maxChars=700000,maxImport=9000,maxStored=25000;
  const roomNames={bedroom:'Sypialnia',salon:'Salon',kitchen:'Kuchnia',bigbath:'Duża łazienka',smallbath:'Mała łazienka',hall:'Przedpokój'};
  const names=[
    ['_sypialnia_','bedroom'],['_salon_','salon'],['_kuchnia_','kitchen'],
    ['_duza_lazienka_','bigbath'],['_mala_lazienka_','smallbath'],['_przedpokoj_','hall']
  ];
  const wall=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function parts(at){
    const out={};for(const p of wall.formatToParts(new Date(at)))if(['year','month','day','hour','minute'].includes(p.type))out[p.type]=p.value;
    return out;
  }
  const dayKey=at=>{const p=parts(at);return p.year+'-'+p.month+'-'+p.day};
  const timeLabel=at=>{const p=parts(at);return p.hour+':'+p.minute};
  function midnight(y,m,d){
    const target=new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
    const candidates=[60,120].map(offset=>Date.UTC(y,m-1,d)-offset*60000);
    const hit=candidates.find(t=>dayKey(t)===target&&timeLabel(t)==='00:00');
    if(hit===undefined)throw Error('Nieprawidłowa data.');
    return hit;
  }
  function bounds(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Nieprawidłowy dzień.');
    const [y,m,d]=date.split('-').map(Number),next=new Date(Date.UTC(y,m-1,d+1));
    const begin=midnight(y,m,d);
    const end=midnight(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate());
    if(dayKey(begin)!==date||!Number.isFinite(end)||end<=begin)throw Error('Nieprawidłowy dzień.');
    return {start:begin,end};
  }
  function splitCsvLine(line){
    const fields=[];let item='',quoted=false,ended=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(quoted){
        if(c==='"'&&line[i+1]==='"'){item+='"';i++}
        else if(c==='"')quoted=false;
        else item+=c;
      }else if(c==='"'&&item===''){quoted=true}
      else if(c===','){fields.push(item);item='';ended=false}
      else if(c==='"')throw Error('Nieprawidłowy cudzysłów w CSV.');
      else {item+=c;ended=false}
    }
    if(quoted)throw Error('Nie zamknięto cudzysłowu w CSV.');
    fields.push(item);
    return fields.map(s=>s.trim());
  }
  function roomFor(entity){
    if(!/^sensor\.setti_[a-z0-9_]+_temperatura_mqtt$/.test(entity))return null;
    const found=names.filter(([part])=>entity.includes(part));
    return found.length===1?found[0][1]:null;
  }
  function parse(text,existing=[]){
    if(typeof text!=='string'||text.length>maxChars)throw Error('Plik historii jest za duży (maksymalnie 700 KB tekstu).');
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map((s,i)=>({s:s.trim(),line:i+1})).filter(x=>x.s);
    if(!lines.length)throw Error('Plik CSV jest pusty.');
    const header=splitCsvLine(lines[0].s).map(x=>x.toLowerCase());
    if(header.length!==3||header[0]!=='entity_id'||header[1]!=='state'||header[2]!=='last_changed')
      throw Error('CSV powinien zawierać kolumny entity_id,state,last_changed (eksport Historii Home Assistant).');
    if(lines.length-1>maxImport)throw Error('W jednym imporcie można przesłać maksymalnie 9000 wierszy.');
    const known=new Map(),out=[...existing];
    for(const r of existing)known.set(r.room+'|'+Date.parse(r.at),r.temp);
    const preview=[];let skipped=0,ignored=0,unavailable=0;const counts={};
    for(const row of lines.slice(1)){
      let fields;try{fields=splitCsvLine(row.s)}catch(error){throw Error('Wiersz '+row.line+': '+error.message)}
      if(fields.length!==3)throw Error('Wiersz '+row.line+': oczekiwano trzech kolumn.');
      const [entity,raw,stamp]=fields,room=roomFor(entity);
      if(!room){ignored++;continue}
      if(['unknown','unavailable','none',''].includes(raw.toLowerCase())){unavailable++;continue}
      const temp=Number(raw.replace(',','.'));
      if(!Number.isFinite(temp)||temp< -10||temp>45)throw Error('Wiersz '+row.line+': nieprawidłowa temperatura.');
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp))
        throw Error('Wiersz '+row.line+': błędna data ISO ze strefą czasową.');
      const ms=Date.parse(stamp);
      if(!Number.isFinite(ms)||new Date(ms).valueOf()>Date.now()+86400000)
        throw Error('Wiersz '+row.line+': nieprawidłowa lub przyszła data.');
      const key=room+'|'+ms;
      if(known.has(key)){
        if(known.get(key)!==temp)throw Error('Wiersz '+row.line+': inna temperatura tego samego czujnika w tej samej chwili.');
        skipped++;continue;
      }
      const value={room,at:new Date(ms).toISOString(),temp};
      preview.push(value);out.push(value);known.set(key,temp);
      counts[room]=(counts[room]||0)+1;
      if(out.length>maxStored)throw Error('Historia przekroczyłaby limit 25 000 wpisów. Zapisz kopię JSON przed usuwaniem starszych dni.');
    }
    if(!preview.length&&!skipped)throw Error('Plik nie zawiera rozpoznanych pomiarów temperatury Setti+ MQTT.');
    out.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.room.localeCompare(b.room));
    return {rows:out,preview,added:preview.length,skipped,ignored,unavailable,counts};
  }
  function days(records){
    return [...new Set(records.map(r=>dayKey(r.at)))].sort().reverse();
  }
  function graph(records,date,pairs=[]){
    const {start,end}=bounds(date);
    const series=[],summary=[];
    let min=Infinity,max=-Infinity;
    for(const [room,label] of Object.entries(roomNames)){
      const all=records.filter(x=>x.room===room).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
      const inDay=all.filter(x=>Date.parse(x.at)>=start&&Date.parse(x.at)<end);
      if(!inDay.length)continue;
      const previous=all.filter(x=>Date.parse(x.at)<start).at(-1);
      const after=all.some(x=>Date.parse(x.at)>=end);
      const points=[];
      if(previous)points.push({at:start,temp:previous.temp,carried:true});
      for(const p of inDay)points.push({at:Date.parse(p.at),temp:p.temp,carried:false});
      if(after&&points.length)points.push({at:end,temp:points.at(-1).temp,carried:true});
      for(const p of points){min=Math.min(min,p.temp);max=Math.max(max,p.temp)}
      series.push({room,label,points});
      summary.push({room,label,count:inDay.length,min:Math.min(...inDay.map(x=>x.temp)),max:Math.max(...inDay.map(x=>x.temp))});
    }
    const heat=pairs.map(x=>({start:Math.max(Date.parse(x.start),start),end:Math.min(Date.parse(x.end),end)})).filter(x=>x.end>x.start);
    return {date,start,end,series,summary,heat,min:Number.isFinite(min)?min:null,max:Number.isFinite(max)?max:null};
  }
  return {parse,days,graph,bounds,dayKey,timeLabel,roomNames,maxStored};
})();
