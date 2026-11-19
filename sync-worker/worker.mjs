// Private gas-reading sync gateway for Cloudflare Workers.
// No public data, no device control, no credentials committed to GitHub.
// The GitHub access token exists ONLY in the Worker's environment secrets.
const REPO = 'dszak/moje-ogrzewanie-archiwum';
const BRANCH = 'main';
const PATH = 'sync/gazomierz-v1.json';
const MAX_EVENTS = 15000;
const MAX_BATCH = 100;
const ID = /^[a-zA-Z0-9_.:-]{3,100}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;

function validTime(value) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return typeof value === 'string' && ISO.test(value) &&
    Number.isFinite(t) && t >= Date.parse('2020-01-01T00:00:00Z') &&
    t <= Date.now() + 86400000 && new Date(t).toISOString() === value;
}
function invalid(message) { throw Object.assign(new Error(message), {status: 400}); }
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
      !ID.test(event.id || '') || !ID.test(event.record_id || '') ||
      !['upsert', 'delete'].includes(event.op) || !validTime(event.at)) {
    invalid('Nieprawidlowe zdarzenie gazomierza.');
  }
  if (event.op === 'delete') {
    if (event.reading !== undefined) invalid('Usuniecie nie moze zawierac odczytu.');
    return {id: event.id, record_id: event.record_id, op: 'delete', at: event.at};
  }
  const r = event.reading;
  if (!r || typeof r !== 'object' || Array.isArray(r) ||
      !validTime(r.at) || typeof r.gas !== 'number' ||
      !Number.isFinite(r.gas) || r.gas < 0 || r.gas > 100000000 ||
      !['old','new'].includes(r.meter) ||
      !['manual','orlen','observation'].includes(r.source)) {
    invalid('Nieprawidlowy odczyt gazomierza.');
  }
  return {id:event.id, record_id:event.record_id, op:'upsert', at:event.at,
    reading:{at:r.at, gas:r.gas, meter:r.meter, source:r.source}};
}
export function validateArchive(obj) {
  if (!obj || obj.schema_version !== 1 || !Array.isArray(obj.events) ||
      obj.events.length > MAX_EVENTS) throw Error('Uszkodzone prywatne archiwum.');
  const events = obj.events.map(validateEvent), known = new Set();
  for (const e of events) {
    if (known.has(e.id)) throw Error('Zduplikowane zdarzenie w archiwum.');
    known.add(e.id);
  }
  return {schema_version:1, events};
}
export function mergeEvents(original, incoming) {
  const archive = validateArchive(original), known = new Map(
    archive.events.map(e => [e.id, JSON.stringify(e)]));
  let added = 0;
  for (const item of incoming) {
    const event = validateEvent(item), serialized = JSON.stringify(event);
    if (known.has(event.id)) {
      if (known.get(event.id) !== serialized) {
        throw Object.assign(new Error('Konflikt identyfikatora zdarzenia.'), {status:409});
      }
      continue;
    }
    archive.events.push(event);
    known.set(event.id, serialized);
    added++;
    if (archive.events.length > MAX_EVENTS) {
      throw Object.assign(new Error('Limit archiwum; wymagana archiwizacja.'), {status:409});
    }
  }
  return {archive, added};
}
export function currentReadings(archive) {
  const current = new Map();
  for (const event of validateArchive(archive).events) {
    if (event.op === 'delete') current.delete(event.record_id);
    else current.set(event.record_id, {id:event.record_id, ...event.reading});
  }
  return [...current.values()].sort((a,b) =>
    Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}
function response(data, status, origin) {
  const headers = {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'"
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return new Response(JSON.stringify(data), {status,headers});
}
function corsFor(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== env.ALLOWED_ORIGIN) {
    throw Object.assign(new Error('Niedozwolone pochodzenie.'), {status:403});
  }
  return origin || null;
}
async function hash(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), b=>b.toString(16).padStart(2,'0')).join('');
}
function eqHash(actual, desired) {
  if (!/^[a-f0-9]{64}$/.test(desired || '')) return false;
  let v=0;
  for (let i=0;i<64;i++) v |= actual.charCodeAt(i)^desired.charCodeAt(i);
  return v===0;
}
async function authorized(request, env, write) {
  const m = /^Bearer ([a-zA-Z0-9._~-]{20,256})$/.exec(
    request.headers.get('authorization') || '');
  if (!m) return false;
  const digest = await hash(m[1]);
  return eqHash(digest, env.SYNC_WRITE_TOKEN_SHA256) ||
    (!write && eqHash(digest,env.SYNC_READ_TOKEN_SHA256));
}
function githubUrl() {
  return 'https://api.github.com/repos/' + REPO + '/contents/' + PATH;
}
function githubHeaders(env) {
  return {
    'authorization':'Bearer ' + env.GITHUB_TOKEN,
    'accept':'application/vnd.github+json',
    'x-github-api-version':'2022-11-28',
    'user-agent':'moje-ogrzewanie-gas-sync'
  };
}
function emptyArchive() { return {schema_version:1,events:[]}; }
async function loadGithub(env) {
  const transport = env.GITHUB_FETCH || fetch;
  const reply = await transport(githubUrl() + '?ref=' + BRANCH,
    {method:'GET', headers:githubHeaders(env), cache:'no-store'});
  if (reply.status === 404) return {archive:emptyArchive(), sha:null};
  if (!reply.ok) throw Error('Nie mozna odczytac prywatnego GitHuba.');
  const payload = await reply.json();
  if (!payload || typeof payload.content !== 'string' ||
      typeof payload.sha !== 'string' || payload.encoding !== 'base64') {
    throw Error('GitHub zwrocil nieoczekiwany format.');
  }
  const bytes = Uint8Array.from(atob(payload.content.replace(/\s+/g,'')),
    c=>c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  if (json.length > 2000000) throw Error('Archiwum jest zbyt duze.');
  return {archive:validateArchive(JSON.parse(json)),sha:payload.sha};
}
async function saveGithub(env, archive, sha) {
  const transport=env.GITHUB_FETCH || fetch;
  const json=JSON.stringify(archive,null,2) + '\n';
  const bytes=new TextEncoder().encode(json);
  let binary='';
  for (let i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]);
  const body={message:'sync: odczyty gazomierza',branch:BRANCH,
    content:btoa(binary)};
  if (sha) body.sha=sha;
  const reply=await transport(githubUrl(), {method:'PUT',
    headers:{...githubHeaders(env),'content-type':'application/json'},
    body:JSON.stringify(body)});
  if (reply.status===409 || reply.status===422) return false;
  if (!reply.ok) throw Error('Nie udalo sie zapisac archiwum do GitHuba.');
  return true;
}
async function handle(request,env) {
  const origin=corsFor(request,env);
  const url=new URL(request.url);
  if (url.pathname !== '/v1/gas') return response({error:'Nie znaleziono.'},404,origin);
  if (request.method==='OPTIONS') {
    const headers={'access-control-allow-methods':'GET, POST, OPTIONS',
      'access-control-allow-headers':'authorization, content-type',
      'access-control-max-age':'600'};
    if (origin) headers['access-control-allow-origin']=origin;
    return new Response(null,{status:204,headers});
  }
  if (!env.GITHUB_TOKEN || !env.SYNC_READ_TOKEN_SHA256 ||
      !env.SYNC_WRITE_TOKEN_SHA256 || !env.ALLOWED_ORIGIN) {
    return response({error:'Synchronizacja nie jest skonfigurowana.'},503,origin);
  }
  if (request.method==='GET') {
    if (!await authorized(request,env,false)) return response({error:'Brak autoryzacji.'},401,origin);
    const {archive}=await loadGithub(env);
    return response({schema_version:1,readings:currentReadings(archive),
      event_count:archive.events.length},200,origin);
  }
  if (request.method==='POST') {
    if (!await authorized(request,env,true)) return response({error:'Brak autoryzacji.'},401,origin);
    const body=await request.text();
    if (body.length>120000) return response({error:'Za duzo danych.'},413,origin);
    let input;
    try {input=JSON.parse(body);}catch(_){return response({error:'Nieprawidlowy JSON.'},400,origin);}
    if (!input || !Array.isArray(input.events) ||
        input.events.length<1 || input.events.length>MAX_BATCH) {
      return response({error:'Podaj od 1 do 100 zdarzen.'},400,origin);
    }
    const events=input.events.map(validateEvent);
    for(let attempt=0;attempt<4;attempt++) {
      const {archive,sha}=await loadGithub(env);
      const merged=mergeEvents(archive,events);
      if (!merged.added) {
        return response({ok:true,added:0,event_count:archive.events.length},200,origin);
      }
      if (await saveGithub(env,merged.archive,sha)) {
        return response({ok:true,added:merged.added,
          event_count:merged.archive.events.length},200,origin);
      }
    }
    return response({error:'Konflikt zapisu, ponow probe.'},409,origin);
  }
  return response({error:'Metoda niedozwolona.'},405,origin);
}
export default {
  async fetch(request,env) {
    try {return await handle(request,env);}
    catch(e) {
      const status=[400,403,409,413].includes(e?.status)?e.status:502;
      const origin=request.headers.get('origin')===env.ALLOWED_ORIGIN ?
        env.ALLOWED_ORIGIN : null;
      return response({error:status===502?'Blad synchronizacji.':String(e.message)},status,origin);
    }
  }
};
