#!/usr/bin/env node
// Private exporter: Home Assistant -> encrypted GitHub file on setti-data.
// Run on a trusted computer/server. Never commit plaintext, tokens or passwords.
import {randomBytes,pbkdf2Sync,createCipheriv,createDecipheriv} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';

const REPO='dszak/moje-ogrzewanie',BRANCH='setti-data',FILE='ha-historia.enc.json';
const ROOM_ENTITIES={
 bedroom:'sensor.setti_ss302_sypialnia_setti_sypialnia_temperatura_mqtt',
 salon:'sensor.setti_ss302_salon_setti_salon_temperatura_mqtt',
 kitchen:'sensor.setti_ss302_kuchnia_setti_kuchnia_temperatura_mqtt',
 bigbath:'sensor.setti_ss302_duza_lazienka_setti_duza_lazienka_temperatura_mqtt',
 smallbath:'sensor.setti_ss302_mala_lazienka_setti_mala_lazienka_temperatura_mqtt',
 hall:'sensor.setti_ss302_przedpokoj_setti_przedpokoj_temperatura_mqtt'
};
const ENGO='binary_sensor.engo_e901wifi_monitoring_zadanie_ogrzewania';
const ENGO_CLIMATE='climate.wireless_internet_thermostat_wi_fi';
const FILE_URL='https://api.github.com/repos/'+REPO+'/contents/'+FILE+'?ref='+BRANCH;
const roomFor=new Map(Object.entries(ROOM_ENTITIES).map(([id,e])=>[e,id]));
function requireEnv(name){const x=process.env[name];if(!x)throw Error('Brak zmiennej '+name);return x}
function key(pass,salt){return pbkdf2Sync(pass,salt,310000,32,'sha256')}
function encrypt(payload,pass,salt=randomBytes(16)){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(pass,salt),iv);
 const plaintext=Buffer.from(JSON.stringify(payload),'utf8');
 const data=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
 return {format:'moje-ogrzewanie-ha-szyfrowane',version:1,kdf:'PBKDF2-SHA256',cipher:'AES-256-GCM',
  rounds:310000,salt:salt.toString('base64'),iv:iv.toString('base64'),data:data.toString('base64')};
}
function decrypt(env,pass){
 if(env.format!=='moje-ogrzewanie-ha-szyfrowane'||env.version!==1||
    env.rounds!==310000||env.kdf!=='PBKDF2-SHA256'||env.cipher!=='AES-256-GCM')
  throw Error('Nieznany format szyfrowania');
 const data=Buffer.from(env.data,'base64'),iv=Buffer.from(env.iv,'base64'),salt=Buffer.from(env.salt,'base64');
 if(iv.length!==12||salt.length!==16||data.length<17)throw Error('Nieprawidłowy plik archiwum');
 const decipher=createDecipheriv('aes-256-gcm',key(pass,salt),iv);
 decipher.setAuthTag(data.subarray(-16));
 return JSON.parse(Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]).toString('utf8'));
}
function normalizeHistory(groups,{demandSources=null,from=-Infinity}={}){
 if(!Array.isArray(groups))throw Error('HA nie zwrócił listy historii');
 const engo=[],temperatures=[];
 for(const group of groups){
  if(!Array.isArray(group))throw Error('Nieprawidłowa struktura historii HA');
  for(const x of group){
   if(!x||typeof x.entity_id!=='string')continue;
   const stamp=x.last_changed;
   if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp)))continue;
   const at=new Date(stamp).toISOString(),state=String(x.state??'').trim();
   if(x.entity_id===ENGO){
    if(state!=='on'&&state!=='off')continue;
    if(demandSources){
      const attributes=x.attributes||{};
      const sourceAt=Number(attributes.event_ts_ms);
      const recorded=Date.parse(at);
      // A restored or initial Recorder state can have a new HA timestamp
      // while carrying an earlier Tuya event. It is not a new transition.
      if(!demandSources.has(attributes.source)||!Number.isSafeInteger(sourceAt)||
         sourceAt<from||sourceAt<recorded-60000||sourceAt>recorded+5000)continue;
    }
    engo.push({at,status:state});
   }else if(roomFor.has(x.entity_id)){
    const temp=Number(state);
    if(state!==''&&Number.isFinite(temp)&&temp>=-10&&temp<=45)
      temperatures.push({room:roomFor.get(x.entity_id),at,temp});
   }
  }
 }
 return {engo,temperatures};
}
// A read-only HA state snapshot. The timestamp "at" is the moment of our
// observation; source_updated_at is HA's last update, which may be older.
function parseEngoClimate(state,at=new Date().toISOString()){
 if(!state||state.entity_id!==ENGO_CLIMATE)throw Error('Nieoczekiwana encja ENGO');
 if(['unknown','unavailable'].includes(state.state))return null;
 const attr=state.attributes||{},temp=attr.current_temperature,target=attr.temperature;
 if(typeof temp!=='number'||!Number.isFinite(temp)||temp<0||temp>45)return null;
 const safeTarget=typeof target==='number'&&Number.isFinite(target)&&target>=5&&target<=35?target:null;
 const last=state.last_updated;
 const sourceUpdated=typeof last==='string'&&Number.isFinite(Date.parse(last))?
  new Date(last).toISOString():null;
 return {at:new Date(at).toISOString(),temp,target:safeTarget,source_updated_at:sourceUpdated};
}
function combine(old,next,climateReading=null){
 const byMinute=new Map(),tempMap=new Map();
 for(const e of [...(old.engo||[]),...next.engo]){
  if(!['on','off'].includes(e.status)||!Number.isFinite(Date.parse(e.at)))throw Error('Błędny stan ENGO');
  const k=Math.floor(Date.parse(e.at)/60000);
  if(byMinute.has(k)&&byMinute.get(k).status!==e.status)throw Error('Kolizja ON/OFF ENGO w tej samej minucie; wymagane ręczne wyjaśnienie');
  if(!byMinute.has(k)||Date.parse(e.at)<Date.parse(byMinute.get(k).at))
   byMinute.set(k,{at:new Date(e.at).toISOString(),status:e.status});
 }
 for(const e of [...(old.temperatures||[]),...next.temperatures]){
  if(!Object.hasOwn(ROOM_ENTITIES,e.room)||!Number.isFinite(e.temp)||e.temp< -10||e.temp>45)
   throw Error('Nieprawidłowa temperatura');
  const at=new Date(e.at).toISOString(),k=e.room+'|'+at;
  if(tempMap.has(k)&&tempMap.get(k).temp!==e.temp)throw Error('Sprzeczny odczyt tej samej temperatury');
  tempMap.set(k,{room:e.room,at,temp:e.temp});
 }
 const engoReadingsMap=new Map();
 for(const e of [...(old.engo_readings||[]),...(next.engo_readings||[]),...(climateReading?[climateReading]:[])]){
  if(!e||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||
     typeof e.temp!=='number'||!Number.isFinite(e.temp)||e.temp<0||e.temp>45||
     !(e.target===null||(typeof e.target==='number'&&Number.isFinite(e.target)&&e.target>=5&&e.target<=35))||
     !(e.source_updated_at==null||(typeof e.source_updated_at==='string'&&Number.isFinite(Date.parse(e.source_updated_at)))))
   throw Error('Nieprawidłowy odczyt termostatu ENGO');
  const at=new Date(e.at).toISOString(),k=at;
  const reading={at,temp:e.temp,target:e.target,source_updated_at:e.source_updated_at||null};
  if(engoReadingsMap.has(k)&&JSON.stringify(engoReadingsMap.get(k))!==JSON.stringify(reading))
   throw Error('Sprzeczny odczyt ENGO w tym samym momencie');
  engoReadingsMap.set(k,reading);
 }
 const engoReadings=[...engoReadingsMap.values()].sort((a,b)=>a.at.localeCompare(b.at));
 const engo=[...byMinute.values()].sort((a,b)=>a.at.localeCompare(b.at));
 const temperatures=[...tempMap.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.room.localeCompare(b.room));
 if(engo.length>40000||temperatures.length>25000||engoReadings.length>25000)
  throw Error('Historia osiągnęła limit aplikacji — nie wolno jej po cichu przycinać');
 return {format:'moje-ogrzewanie-ha-historia',version:1,generated_at:new Date().toISOString(),engo,temperatures,engo_readings:engoReadings};
}
// The optional allowlist is operator-supplied. Entity IDs and credentials are
// never serialized. Only the scoped, encrypted snapshot can reach the PWA.
const dashboardKeys={climate:'climate',demand:'binary_sensor',enabled:'binary_sensor',relay:'binary_sensor',
  target:'sensor',measured:'sensor',mode:'sensor',power:'sensor'};
function dashboardMapping(raw){
 const input=JSON.parse(raw);
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('Nieprawidłowa mapa tablicy HA');
 for(const [field,entity] of Object.entries(input)){
   if(!Object.hasOwn(dashboardKeys,field)||typeof entity!=='string'||
      !new RegExp('^'+dashboardKeys[field]+'\\.[a-z0-9_]+$').test(entity))
      throw Error('Nieprawidłowe pole lub domena mapy tablicy HA');
 }
 if(new Set(Object.values(input)).size!==Object.keys(input).length)
   throw Error('W mapie tablicy HA powtórzono encję');
 return input;
}
function dashboardConfig(config){
 const fields={climate:'engo.climate',demand:'engo.demand',enabled:'bath.convector.enabled',
   target:'bath.convector.target',measured:'bath.convector.temp',mode:'bath.convector.mode',
   relay:'bath.dehumidifier.relay',power:'bath.dehumidifier.power_w'};
 const mapping=dashboardMapping(JSON.stringify(Object.fromEntries(Object.entries(fields)
   .filter(([,series])=>config.entities?.[series]).map(([field,series])=>[field,config.entities[series]]))));
 const sources=new Set(config.demand_sources||[]);
 if(!sources.size)throw Error('Brak zatwierdzonych źródeł żądania ENGO.');
 return {mapping,sources};
}
function dashboardSnapshot(states,mapping,sources=null){
 const bath={},result={bath};
 const get=field=>states[field];
 const at=(row,preferObserved=false)=>{
   const timestamp=preferObserved?(row?.attributes?.observed_at||row?.last_updated):row?.last_updated;
   return typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))?new Date(timestamp).toISOString():null;
 };
 const valid=(x,min,max)=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&
   Number.isFinite(Number(x))&&Number(x)>=min&&Number(x)<=max?Number(x):null;
 const toggle=x=>['on','off'].includes(x)?x:null;
 if(mapping.climate||mapping.demand){
   const climate=get('climate'),requested=get('demand');
   const demand=sources&&!sources.has(requested?.attributes?.source)?null:requested;
   const attrs=climate&& !['unknown','unavailable'].includes(climate.state)?climate.attributes||{}:{};
   const eventTime=valid(demand?.attributes?.event_ts_ms,1,Date.now()+60000);
   // Recorder timestamps can change on restore. The upstream event is timestamped
   // separately and required for the optional ENGO snapshot.
   const demandAt=eventTime===null?null:new Date(eventTime).toISOString();
   const observedAt=at(climate);
   result.engo={target:observedAt?valid(attrs.temperature,0,50):null,
    measured:observedAt?valid(attrs.current_temperature,-10,50):null,
    observedAt,demand:demandAt?toggle(demand.state):null,demandAt};
 }
 for(const field of ['enabled','relay','mode','target','measured','power']){
   const row=get(field), ts=at(row,true);
   if(!ts)continue;
   const unit=row.attributes?.unit_of_measurement;
   const value=field==='enabled'||field==='relay'?toggle(row.state):
     field==='mode'?(typeof row.state==='string'&&/^[a-zA-Z0-9_-]{1,30}$/.test(row.state)&&!['unavailable','unknown'].includes(row.state)?row.state:null):
     field==='power'?(unit==='W'?valid(row.state,0,8000):null):
     (unit==='°C'?valid(row.state,-30,70):null);
   bath[field]={value,at:ts};
 }
 return result;
}
async function fetchDashboard(base,token,mapping,sources){
 const pairs=await Promise.all(Object.entries(mapping).map(async ([field,entity])=>{
   const res=await fetch(new URL('/api/states/'+encodeURIComponent(entity),base),{
     headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(6000)});
   if(res.status===404)return [field,null];
   if(!res.ok)throw Error('Odczyt tablicy z HA zwrócił HTTP '+res.status);
   return [field,await res.json()];
 }));
 const states=Object.fromEntries(pairs);
 return {snapshot:dashboardSnapshot(states,mapping,sources),climate:states.climate};
}
async function github(path,token,opts={}){
 const res=await fetch(path,{...opts,headers:{
  'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,
  'X-GitHub-Api-Version':'2022-11-28',...opts.headers}});
 if(!res.ok)throw Error('GitHub HTTP '+res.status+' '+(await res.text()).slice(0,150));
 return res.json();
}
async function main(){
 const haUrl=requireEnv('HA_URL').replace(/\/$/,'');
 if(!haUrl.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(haUrl) &&
    !(process.env.HA_ALLOW_LAN_HTTP==='1'&&/^http:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)(?::\d+)?$/i.test(haUrl)))
  throw Error('HA_URL wymaga HTTPS; HTTP tylko dla localhost lub prywatnego LAN z HA_ALLOW_LAN_HTTP=1');
 const haToken=requireEnv('HA_TOKEN'),ghToken=requireEnv('GITHUB_TOKEN'),pass=requireEnv('HA_HISTORY_PASSPHRASE');
 if(pass.length<16)throw Error('Hasło historii musi mieć co najmniej 16 znaków (zalecane 24+)');
 const days=Number(process.env.HA_DAYS||'3');
 if(!Number.isInteger(days)||days<1||days>14)throw Error('HA_DAYS musi być między 1 a 14');
 const configPath=process.env.HA_TELEMETRY_CONFIG;
 const config=configPath?dashboardConfig(JSON.parse(await readFile(configPath,'utf8'))):null;
 const mapping=config?.mapping||(process.env.HA_DASHBOARD_ENTITIES?dashboardMapping(process.env.HA_DASHBOARD_ENTITIES):null);
 const to=new Date(),from=new Date(to.getTime()-days*86400000);
 const entities=[...Object.values(ROOM_ENTITIES),ENGO];
 const url=new URL('/api/history/period/'+encodeURIComponent(from.toISOString()),haUrl);
 url.searchParams.set('end_time',to.toISOString());
 url.searchParams.set('filter_entity_id',entities.join(','));
 const resp=await fetch(url,{headers:{Authorization:'Bearer '+haToken,'Content-Type':'application/json'}});
 if(!resp.ok)throw Error('Home Assistant HTTP '+resp.status);
 const newData=normalizeHistory(await resp.json(),{demandSources:config?.sources,from:from.valueOf()});
 if(newData.engo.length===0&&newData.temperatures.length===0)
  throw Error('Brak rozpoznanej historii w HA — przerwano eksport zamiast publikować pusty plik');
 let previous={engo:[],temperatures:[]},sha=null,salt;
 const current=await fetch(FILE_URL,{headers:{Authorization:'Bearer '+ghToken,'Accept':'application/vnd.github+json'}});
 if(current.status===200){
  const body=await current.json();
  sha=body.sha;
  const env=JSON.parse(Buffer.from(body.content.replace(/\s/g,''),'base64').toString('utf8'));
  previous=decrypt(env,pass);
  salt=Buffer.from(env.salt,'base64'); // Keep KDF salt stable for iPhone's remembered CryptoKey.
 }else if(current.status!==404)throw Error('GitHub odczyt: HTTP '+current.status);
 let climateReading=null;
 if(previous.dashboard) newData.dashboard=previous.dashboard;
 if(mapping){
  try{
   const current=await fetchDashboard(haUrl,haToken,mapping,config?.sources);
   newData.dashboard=current.snapshot;
   if(current.climate)climateReading=parseEngoClimate(current.climate);
  }catch(_){console.error('Migawka tablicy niedostępna. Zachowuję ostatnią zapisaną migawkę i eksportuję historię.');}
 }
 if(!mapping?.climate)try{
   const response=await fetch(new URL('/api/states/'+encodeURIComponent(ENGO_CLIMATE),haUrl),{
     headers:{Authorization:'Bearer '+haToken},redirect:'error',signal:AbortSignal.timeout(6000)});
   if(response.ok)climateReading=parseEngoClimate(await response.json());
 }catch(_){console.error('Nie pobrano próbki historii temperatury ENGO.');}
 const merged=combine(previous,newData,climateReading);
 if(newData.dashboard)merged.dashboard=newData.dashboard;
 if(process.env.HA_EXPORT_VERIFY_ONLY==='1'){
  console.log(JSON.stringify({verifyOnly:true,demandBefore:previous.engo.length,demandAfter:merged.engo.length,
    climateBefore:(previous.engo_readings||[]).length,climateAfter:merged.engo_readings.length,
    roomBefore:previous.temperatures.length,roomAfter:merged.temperatures.length,
    dashboardFields:merged.dashboard?Object.keys(merged.dashboard.bath||{}).sort():[],
    engoFields:merged.dashboard?.engo?['target','measured','demand'].filter(key=>merged.dashboard.engo[key]!==null):[]}));
  return;
 }
 const ciphertext=JSON.stringify(encrypt(merged,pass,salt),null,2)+'\n';
 const encoded=Buffer.from(ciphertext,'utf8').toString('base64');
 await github('https://api.github.com/repos/'+REPO+'/contents/'+FILE,ghToken,{
  method:'PUT',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({message:'data: update encrypted HA demand and temperature history',branch:BRANCH,content:encoded,...(sha?{sha}:{})})
 });
 console.log('Zaszyfrowana historia opublikowana: zdarzeń ENGO',merged.engo.length,
  ', zmian temperatur',merged.temperatures.length,'; brak tekstu jawnego w GitHub.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(err=>{console.error(err.message);process.exitCode=1});
}
export {encrypt,decrypt,normalizeHistory,combine,ROOM_ENTITIES,ENGO,dashboardMapping,dashboardSnapshot,dashboardConfig,parseEngoClimate};
