'use strict';
// Private ENGO demand events imported from screenshots transcribed to CSV.
// This module never connects to or controls a thermostat.
const EngoCycles=(()=>{
  const maxRows=2000;
  const maxText=90000;
  const timeKey=(at)=>Math.floor(Date.parse(at)/60000);
  const dayFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'});
  const wallFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wallParts=(at)=>{
    const bits={};
    wallFormat.formatToParts(new Date(at)).forEach(p=>{
      if(['year','month','day','hour','minute'].includes(p.type))bits[p.type]=p.value;
    });
    return bits;
  };
  const dayKey=(at)=>{const p=wallParts(at);return p.year+'-'+p.month+'-'+p.day};
  const localDateTime=(at)=>{const p=wallParts(at);return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute};
  // ENGO screenshots show Polish civil time. Resolve CET/CEST explicitly so
  // importing on a computer set to UTC or on a trip never shifts the event.
  // The repeated DST hour is ambiguous without an offset: reject, don't guess.
  function polishDate(y,m,d,h,minute){
    const possible=[60,120].map(offset=>new Date(Date.UTC(y,m-1,d,h,minute)-offset*60000));
    const matching=possible.filter(at=>{
      const p=wallParts(at);
      return Number(p.year)===y&&Number(p.month)===m&&Number(p.day)===d&&Number(p.hour)===h&&Number(p.minute)===minute;
    });
    return matching.length===1?matching[0]:null;
  }
  function parse(text,existing=[]){
    if(typeof text!=='string'||text.length>maxText)throw Error('Tekst ENGO jest zbyt długi (limit 90 000 znaków).');
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
    const rows=lines.map((line,i)=>({line:line.trim(),n:i+1})).filter(r=>r.line);
    if(!rows.length)throw Error('Wklej przynajmniej jedno zdarzenie ENGO.');
    if(rows.length>maxRows+1)throw Error('Wczytaj maksymalnie 2000 zdarzeń jednorazowo.');
    const known=new Map();
    for(const r of existing){
      const key=timeKey(r.at);
      if(Number.isFinite(key))known.set(key,r.status);
    }
    const added=[];let skipped=0;
    for(const row of rows){
      if(/^data\s*;\s*godzina\s*;\s*stan$/i.test(row.line))continue;
      const fields=row.line.split(';').map(x=>x.trim());
      if(fields.length!==3)throw Error('Wiersz '+row.n+': oczekiwano data;godzina;stan.');
      const [date,time,state]=fields;
      const md=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),mt=/^(\d{2}):(\d{2})$/.exec(time);
      if(!md||!mt)throw Error('Wiersz '+row.n+': data RRRR-MM-DD i godzina GG:MM.');
      const y=Number(md[1]),m=Number(md[2]),d=Number(md[3]),h=Number(mt[1]),minute=Number(mt[2]);
      const at=polishDate(y,m,d,h,minute);
      if(!at||at.valueOf()>Date.now()+86400000)
        throw Error('Wiersz '+row.n+': nieprawidłowa, niejednoznaczna (zmiana czasu) lub przyszła data.');
      const upper=state.toLocaleUpperCase('pl-PL');
      const status=['ON','WŁĄCZONE','ZAŁĄCZONE'].includes(upper)?'on':['OFF','WYŁĄCZONE'].includes(upper)?'off':null;
      if(!status)throw Error('Wiersz '+row.n+': stan musi być ON albo OFF.');
      const key=Math.floor(at.valueOf()/60000);
      if(known.has(key)){
        if(known.get(key)!==status)throw Error('Wiersz '+row.n+': sprzeczne stany w tej samej minucie.');
        skipped++;continue;
      }
      const iso=at.toISOString();
      added.push({id:'engo-'+at.valueOf()+'-'+status,at:iso,status,source:'import'});
      known.set(key,status);
    }
    const all=[...existing,...added].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    return {rows:all,added:added.length,skipped,preview:added};
  }
  function analyze(records){
    const sorted=[...records].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const pairs=[];let pending=null,incomplete=0;
    for(const entry of sorted){
      if(entry.status==='on'){
        if(pending)incomplete++;
        pending=entry;
      }else if(entry.status==='off'){
        if(!pending){incomplete++;continue}
        const mins=(Date.parse(entry.at)-Date.parse(pending.at))/60000;
        if(mins<=0||mins>10080){incomplete++;pending=null;continue}
        pairs.push({start:pending.at,end:entry.at,minutes:mins,day:dayKey(pending.at)});
        pending=null;
      }
    }
    if(pending)incomplete++;
    const groups=new Map();
    for(const event of sorted){
      const day=dayKey(event.at);
      if(!groups.has(day))groups.set(day,{day,events:[],count:0,minutes:0,avg:0,ratio:null});
      groups.get(day).events.push(event);
    }
    for(const pair of pairs){
      const group=groups.get(pair.day);
      group.count++;group.minutes+=pair.minutes;
    }
    for(const group of groups.values()){
      const times=group.events.map(r=>Date.parse(r.at));
      const span=(Math.max(...times)-Math.min(...times))/60000;
      group.avg=group.count?group.minutes/group.count:0;
      const crossing=pairs.some(p=>p.day===group.day&&dayKey(p.end)!==group.day);
      group.ratio=span>0&&!crossing&&group.minutes<=span?100*group.minutes/span:null;
    }
    return {pairs,incomplete,days:[...groups.values()].sort((a,b)=>b.day.localeCompare(a.day)),totalMinutes:pairs.reduce((sum,p)=>sum+p.minutes,0)};
  }
  return {parse,analyze,dayKey,localDateTime};
})();
