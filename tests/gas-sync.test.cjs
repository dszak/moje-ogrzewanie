'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const mod=import('../sync-worker/worker.mjs');
const when='2026-11-19T19:47:55.000Z';
const gas=(id='g-123',n=775.696)=>({
  id:'event-'+id,record_id:id,op:'upsert',at:when,
  reading:{at:when,gas:n,meter:'new',source:'manual'}
});
const digest=x=>createHash('sha256').update(x).digest('hex');

function fakeGitHub(){
  let file=null, writes=0, authOk=true;
  const githubFetch=async(url,options)=>{
    assert.match(url,/^https:\/\/api\.github\.com\/repos\/dszak\/moje-ogrzewanie-archiwum\/contents\/sync\/gazomierz-v1\.json/);
    if(options.headers.authorization!=='Bearer private-github-secret')authOk=false;
    if(options.method==='GET'){
      return file?new Response(JSON.stringify(file),{status:200}):
        new Response('',{status:404});
    }
    assert.equal(options.method,'PUT');
    const body=JSON.parse(options.body);
    if(file&&body.sha!==file.sha)return new Response('{}',{status:409});
    if(!file&&body.sha)return new Response('{}',{status:409});
    writes++;
    file={encoding:'base64',content:body.content,sha:'test-sha-'+writes};
    return new Response('{}',{status:201});
  };
  return {githubFetch,get writes(){return writes},get authOk(){return authOk}};
}
function env(githubFetch){
  return {GITHUB_FETCH:githubFetch,GITHUB_TOKEN:'private-github-secret',
    SYNC_READ_TOKEN_SHA256:digest('read'.repeat(12)),
    SYNC_WRITE_TOKEN_SHA256:digest('write'.repeat(12)),
    ALLOWED_ORIGIN:'https://dszak.github.io'};
}
function call(token,method='GET',body=null,origin='https://dszak.github.io'){
  return new Request('https://secure-sync.example/v1/gas',{
    method,headers:{'origin':origin,'authorization':'Bearer '+token,
      'content-type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
test('gas event contract normalizes harmless extra fields, rejects bad entries', async()=>{
  const {validateEvent}=await mod;
  assert.equal(validateEvent({...gas(),address:'not-synced'}).reading.gas,775.696);
  assert.equal(validateEvent({...gas(),address:'not-synced'}).address,undefined);
  assert.throws(()=>validateEvent({...gas(),reading:{...gas().reading,gas:Infinity}}));
  assert.throws(()=>validateEvent({...gas(),reading:{...gas().reading,meter:'unknown'}}));
  assert.throws(()=>validateEvent({...gas(),record_id:'../../bad'}));
});
test('idempotent append and tombstones preserve history and deletions',async()=>{
  const {mergeEvents,currentReadings}=await mod;
  const first=mergeEvents({schema_version:1,events:[]},[gas()]);
  assert.equal(first.added,1);
  const duplicate=mergeEvents(first.archive,[gas()]);
  assert.equal(duplicate.added,0);
  assert.equal(currentReadings(duplicate.archive)[0].gas,775.696);
  const del={id:'event-delete-123',record_id:'g-123',at:when,op:'delete'};
  const archived=mergeEvents(duplicate.archive,[del]);
  assert.equal(currentReadings(archived.archive).length,0);
  assert.equal(archived.archive.events.length,2);
  assert.throws(()=>mergeEvents(first.archive,[{...gas(),reading:{...gas().reading,gas:3}}]));
});
test('read and write are independently scoped, private GitHub only',async()=>{
  const {default:worker}=await mod, github=fakeGitHub(),settings=env(github.githubFetch);
  const missing=await worker.fetch(call('invalid-key-short'),settings);
  assert.equal(missing.status,401);
  const readKey='read'.repeat(12),writeKey='write'.repeat(12);
  const denied=await worker.fetch(call(readKey,'POST',{events:[gas()]}),settings);
  assert.equal(denied.status,401);
  const created=await worker.fetch(call(writeKey,'POST',{events:[gas()]}),settings);
  assert.equal(created.status,200);
  assert.equal((await created.json()).added,1);
  const duplicate=await worker.fetch(call(writeKey,'POST',{events:[gas()]}),settings);
  assert.equal((await duplicate.json()).added,0);
  const result=await worker.fetch(call(readKey),settings);
  assert.equal(result.status,200);
  assert.equal((await result.json()).readings[0].gas,775.696);
  assert.equal(github.writes,1);
  assert.equal(github.authOk,true);
});
test('origin, schema, size and unconfigured service are rejected safely',async()=>{
  const {default:worker}=await mod, github=fakeGitHub(),settings=env(github.githubFetch);
  const rejected=await worker.fetch(call('write'.repeat(12),'GET',null,'https://not-ours.example'),settings);
  assert.equal(rejected.status,403);
  const invalid=await worker.fetch(call('write'.repeat(12),'POST',{events:[{...gas(),reading:{...gas().reading,gas:-1}}]}),settings);
  assert.equal(invalid.status,400);
  const disabled=await worker.fetch(call('read'.repeat(12)),{...settings,GITHUB_TOKEN:''});
  assert.equal(disabled.status,503);
  assert.equal(github.writes,0);
});
