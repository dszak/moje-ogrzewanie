// Additional Bathroom readings inside the existing encrypted Home Assistant export.
const layout = {
 smallbath:{temperature:'room.smallbath.temp',humidity:'room.smallbath.rh',
  relay:'bath.dehumidifier.relay',power:'bath.dehumidifier.power_w',energy:'bath.dehumidifier.energy_total_kwh'},
 bigbath:{temperature:'room.bigbath.temp',humidity:'room.bigbath.rh',
  relay:'bath.bigbath.dehumidifier.relay',power:'bath.bigbath.dehumidifier.power_w',energy:'bath.bigbath.dehumidifier.energy_total_kwh'}
};
const domains = {temperature:['sensor'],humidity:['sensor'],relay:['binary_sensor','switch'],
 power:['sensor'],energy:['sensor']};
const windowsDays = 14;

export function bathroomMapping(config) {
 const seen=new Set();
 const result={};
 for(const [room,fields] of Object.entries(layout)){
  const mapped={};
  for(const [field,series] of Object.entries(fields)){
   const id=config.entities?.[series];
   if(id===undefined)continue;
   if(typeof id!=='string'||!/^\w+\.[a-z0-9_]+$/.test(id)||!domains[field].includes(id.split('.')[0])||
      seen.has(id))throw Error('Niejednoznaczne albo nieprawidłowe mapowanie odczytu łazienki.');
   seen.add(id);mapped[field]=id;
  }
  if(Object.keys(mapped).length)result[room]=mapped;
 }
 return result;
}

export function bathroomReading(field,row) {
 if(!row||typeof row.state!=='string')return null;
 const attrs=row.attributes||{};
 const absent=['unknown','unavailable'].includes(row.state);
 const base=row.last_updated||row.last_changed;
 // A fresh observation from the bridge is more precise. Invalidation begins
 // when HA marks the sensor unavailable, even if it retains old attributes.
 const time=!absent&&['relay','power','energy'].includes(field)&&attrs.observed_at?attrs.observed_at:base;
 if(typeof time!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(time)||!Number.isFinite(Date.parse(time)))return null;
 const at=new Date(time).toISOString();
 if(absent)return {at,value:null};
 if(field==='relay')return ['on','off'].includes(row.state)?{at,value:row.state}:{at,value:null};
 if(!row.state.trim()||!Number.isFinite(Number(row.state)))return {at,value:null};
 const n=Number(row.state), unit=attrs.unit_of_measurement;
 let value=null;
 if(field==='temperature'&&unit==='°C'&&attrs.device_class==='temperature'&&n>=-20&&n<=65)value=n;
 if(field==='humidity'&&unit==='%'&&attrs.device_class==='humidity'&&n>=0&&n<=100)value=n;
 if(field==='power'&&attrs.device_class==='power'&&['W','kW'].includes(unit)){
  const scaled=unit==='kW'?n*1000:n;
  if(scaled>=0&&scaled<=4000)value=scaled;
 }
 if(field==='energy'&&attrs.device_class==='energy'&&attrs.state_class==='total_increasing'&&
    ['Wh','kWh'].includes(unit)&&n>=0)value=unit==='Wh'?n/1000:n;
 return {at,value};
}

export function mergeBathrooms(previous,mapping,groups,current,now=Date.now()){
 const byEntity=new Map(groups.filter(rows=>Array.isArray(rows)&&rows.length)
  .map(rows=>[rows[0].entity_id,rows]));
 const cutoff=now-windowsDays*86400000;
 const result={};
 for(const [room,fields] of Object.entries(mapping)){
  const latest={}, history={};
  for(const [field,id] of Object.entries(fields)){
   const rows=new Map();
   const remember=row=>{
    if(!row||Date.parse(row.at)<cutoff||Date.parse(row.at)>now+60000)return;
    if(rows.has(row.at)&&rows.get(row.at)!==row.value)rows.set(row.at,null);
    else rows.set(row.at,row.value);
   };
   (previous?.[room]?.history?.[field]||[]).forEach(remember);
   for(const row of byEntity.get(id)||[])remember(bathroomReading(field,row));
   latest[field]=bathroomReading(field,current[id]);
   remember(latest[field]);
   history[field]=[...rows].sort(([a],[b])=>a.localeCompare(b)).map(([at,value])=>({at,value}));
   if(history[field].length>9000)throw Error('Za dużo odczytów łazienki w oknie aplikacji.');
  }
  result[room]={latest,history};
 }
 return result;
}

export async function readBathrooms(base,token,config,previous,from,to){
 const mapping=bathroomMapping(config);
 const entries=Object.values(mapping).flatMap(Object.values);
 if(!entries.length)return null;
 const headers={Authorization:'Bearer '+token};
 const start=previous?from:new Date(to.valueOf()-windowsDays*86400000);
 const url=new URL('/api/history/period/'+encodeURIComponent(start.toISOString()),base);
 url.searchParams.set('end_time',to.toISOString());
 url.searchParams.set('filter_entity_id',entries.join(','));
 const history=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!history.ok)throw Error('Historia łazienek niedostępna.');
 const groups=await history.json();
 if(!Array.isArray(groups))throw Error('Nieprawidłowa historia łazienek.');
 const current=Object.fromEntries(await Promise.all(entries.map(async id=>{
  try{
   const reply=await fetch(new URL('/api/states/'+encodeURIComponent(id),base),
    {headers,redirect:'error',signal:AbortSignal.timeout(6000)});
   return [id,reply.ok?await reply.json():null];
  }catch{return [id,null];}
 })));
 return mergeBathrooms(previous,mapping,groups,current,to.valueOf());
}
