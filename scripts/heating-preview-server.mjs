// Isolated acceptance site. The runtime config and Home Assistant credential stay on the Mac.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {dashboardMapping, dashboardSnapshot} from './ha-history-export.mjs';

const [directory, configPath, identityPath, port] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const owner = (await readFile(identityPath, 'utf8')).trim();
if (!owner || !Number.isInteger(Number(port))) throw Error('Missing preview owner or port.');
const token = execFileSync('/usr/bin/security', [
  'find-generic-password', '-a', config.ha_keychain_account, '-s', config.ha_keychain_service, '-w'
], {encoding:'utf8', stdio:['ignore','pipe','ignore'],timeout:10000}).trim();
if (!token) throw Error('Missing Home Assistant read credential.');
const fields = {
  climate:'engo.climate', demand:'engo.demand', enabled:'bath.convector.enabled',
  target:'bath.convector.target', measured:'bath.convector.temp', mode:'bath.convector.mode',
  relay:'bath.dehumidifier.relay', power:'bath.dehumidifier.power_w'
};
const mapping = dashboardMapping(JSON.stringify(Object.fromEntries(
  Object.entries(fields).map(([field,series]) => {
    if (!config.entities[series]) throw Error('Missing mapped source '+series);
    return [field,config.entities[series]];
  })
)));
const sources = new Set(config.demand_sources);
if (!sources.size) throw Error('Missing trusted sources for ENGO demand.');

let recent = null;
let pending = null;
async function refresh() {
  if (recent && Date.now()-recent.time<20000) return recent.payload;
  if (pending) return pending;
  pending = (async () => {
    const pairs = await Promise.all(Object.entries(mapping).map(async ([field,entity]) => {
      try {
        const response = await fetch(new URL('/api/states/'+encodeURIComponent(entity),config.ha_url), {
          headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(6000)
        });
        return [field,response.ok?await response.json():null];
      } catch {
        return [field,null];
      }
    }));
    const states = Object.fromEntries(pairs);
    if (Object.values(states).every(row=>!row)) throw Error('Home Assistant unavailable.');
    if (!sources.has(states.demand?.attributes?.source)) states.demand=null;
    const snapshot = dashboardSnapshot(states,mapping);
    const time = Date.now();
    const payload = {
      format:'moje-ogrzewanie-ha-historia',version:1,generated_at:new Date(time).toISOString(),
      engo:[],temperatures:[],dashboard:snapshot
    };
    recent = {time,payload};
    return payload;
  })().finally(()=>{pending=null;});
  return pending;
}

const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',
  png:'image/png',webmanifest:'application/manifest+json'};
const assets = new Set([
  'index.html','app.js','storage.js','insights.js','engo.js','temperatures.js',
  'temperature-view.js','research.js','memory.js','memory-view.js','review.js','review-view.js',
  'setti.js','heads.js','dehumidifiers.js','ha-sync.js','gas-sync.js','boiler-sync.js','heating-board.js',
  'heating-views.js','review-fixture.js','sw.js','manifest.webmanifest','icons/icon192.png','icons/icon512.png'
]);
const root = resolve(directory);
const server = createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','private, no-store');
  if (req.headers['tailscale-user-login']!==owner) return res.writeHead(403).end('Prywatny podgląd Tailscale.');
  if (req.method!=='GET' && req.method!=='HEAD') return res.writeHead(405,{Allow:'GET, HEAD'}).end();
  const path = req.url.split('?')[0];
  if (path==='/api/telemetry') {
    try {
      const payload=await refresh();
      return res.writeHead(200,{'Content-Type':'application/json'}).end(
        req.method==='HEAD'?undefined:JSON.stringify(payload));
    } catch {
      return res.writeHead(503).end();
    }
  }
  const file=path==='/'?'index.html':path.slice(1);
  if (!assets.has(file)) return res.writeHead(404).end();
  try {
    const content=await readFile(resolve(root,file));
    res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)]});
    res.end(req.method==='HEAD'?undefined:content);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(Number(port),'127.0.0.1',()=>console.log('Heating preview ready.'));
