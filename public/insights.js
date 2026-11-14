'use strict';
// Weather is city-level, model-derived data. Gas history and weather stay in local storage.
const Insights=(()=>{
  const CITY={lat:50.26,lon:19.03}, BASE=21.5;
  const dateAt=(ms)=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
    const f=k=>p.find(x=>x.type===k).value;return f('year')+'-'+f('month')+'-'+f('day')};
  const validNum=n=>typeof n==='number'&&Number.isFinite(n);
  function normalizeHourly(rows){const m=new Map();for(const h of rows||[]){if(validNum(h.at)&&validNum(h.temp)&&h.temp>=-45&&h.temp<=50)m.set(Math.floor(h.at/3600)*3600,Math.round(h.temp*10)/10)}return [...m].sort((a,b)=>a[0]-b[0]).slice(-12000).map(([at,temp])=>({at,temp}))}
  async function refresh(existing, fetcher=fetch, nowMs=Date.now()){
    const common='latitude='+CITY.lat+'&longitude='+CITY.lon+'&hourly=temperature_2m&timezone=Europe%2FWarsaw&timeformat=unixtime';
    const first=dateAt(nowMs-365*86400000), last=dateAt(nowMs-5*86400000);
    const urls=[
      'https://archive-api.open-meteo.com/v1/archive?'+common+'&start_date='+first+'&end_date='+last,
      'https://api.open-meteo.com/v1/forecast?'+common+'&past_days=14&forecast_days=1'
    ];
    const replies=await Promise.allSettled(urls.map(async url=>{const r=await fetcher(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();
      if(!data.hourly||!Array.isArray(data.hourly.time)||!Array.isArray(data.hourly.temperature_2m))throw Error('Nieprawidłowe dane pogodowe');
      return data.hourly.time.map((t,i)=>({at:t,temp:data.hourly.temperature_2m[i]})).filter(x=>x.at*1000<=nowMs+3600000)
    }));
    const good=replies.filter(r=>r.status==='fulfilled');
    if(!good.length)throw Error('Nie udało się pobrać pogody. Sprawdź internet i spróbuj ponownie.');
    const hourly=normalizeHourly([...(existing.hourly||[]),...good.flatMap(r=>r.value)]);
    return {hourly,updated:new Date(nowMs).toISOString()};
  }
  function near(hourly,ms){const ts=ms/1000;let best=null,d=5401;for(const h of hourly||[]){const delta=Math.abs(h.at-ts);if(delta<d){best=h;d=delta}}return d<=5400?best:null}
  function readings(state){
    const a=(state.gasHistory||[]).map(r=>({at:Date.parse(r.at),gas:r.gas,meter:r.meter,source:r.source}));
    for(const c of state.conditions||[])if(validNum(c.gas))a.push({at:Date.parse(c.at),gas:c.gas,meter:c.meter||'new',source:'pomiar'});
    return a.filter(x=>validNum(x.at)&&validNum(x.gas)).sort((x,y)=>x.at-y.at);
  }
  function intervals(state){
    const list=readings(state), groups={old:[],new:[]};
    for(const r of list)groups[r.meter]?.push(r);
    const rows=[];
    for(const meter of ['old','new']){
      const a=groups[meter].sort((x,y)=>x.at-y.at||x.gas-y.gas);
      for(let i=1;i<a.length;i++){
        const b=a[i-1],e=a[i],days=(e.at-b.at)/86400000,gas=e.gas-b.gas;
        if(days<=0.03||gas<0)continue;
        const hourly=(state.weather?.hourly||[]).filter(h=>h.at*1000>=b.at&&h.at*1000<e.at);
        const coverage=Math.min(1,hourly.length/(days*24)),have=coverage>=.75&&hourly.length>0;
        const avg=have?hourly.reduce((s,h)=>s+h.temp,0)/hourly.length:null;
        const dd=have?hourly.reduce((s,h)=>s+Math.max(0,BASE-h.temp),0)/24:null;
        rows.push({meter,start:b.at,end:e.at,gas,days,perDay:gas/days,avg,dd,normalized:dd>0?gas/dd:null,coverage,from:b.source,to:e.source});
      }
    }
    return rows.sort((a,b)=>b.end-a.end);
  }
  function importRows(text,existing){
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(!lines.length)throw Error('Wklej co najmniej jeden odczyt.');
    if(lines.length>2000)throw Error('Za dużo odczytów naraz.');
    const result=[];
    for(let i=0;i<lines.length;i++){
      const part=lines[i].split(';').map(x=>x.trim());
      if(part.length!==3)throw Error('Wiersz '+(i+1)+': wpisz data;licznik;stan, np. 2026-04-01;nowy;100');
      const [d,m,g]=part;
      if(!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(d))throw Error('Wiersz '+(i+1)+': nieprawidłowa data.');
      const date=new Date(d.replace(' ','T').length===10?d+'T12:00:00':d.replace(' ','T')+':00');
      if(!Number.isFinite(date.valueOf())||dateAt(date.valueOf())!==d.slice(0,10))throw Error('Wiersz '+(i+1)+': nieprawidłowa data kalendarzowa.');
      const meter={'nowy':'new','new':'new','stary':'old','old':'old'}[m.toLowerCase()];
      const value=Number(g.replace(',','.'));
      if(!meter||!Number.isFinite(value)||value<0||value>100000000)throw Error('Wiersz '+(i+1)+': licznik lub stan niepoprawny.');
      result.push({id:'orlen-'+date.valueOf()+'-'+meter+'-'+value,at:date.toISOString(),gas:value,meter,source:'orlen'});
    }
    const all=[...(existing||[])],keys=new Set(all.map(r=>r.meter+'|'+r.at+'|'+r.gas));let added=0;
    for(const item of result){const k=item.meter+'|'+item.at+'|'+item.gas;if(!keys.has(k)){all.push(item);keys.add(k);added++}}
    all.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));return {rows:all,added};
  }
  return {refresh,near,readings,intervals,importRows,BASE};
})();