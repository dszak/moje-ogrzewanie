import '../public/journal-model.js';
const model=globalThis.JournalModel;
const repoName='dszak/moje-ogrzewanie-archiwum';
const path='sync/dziennik-v1.json';
const tokenPattern=/^[a-f0-9]{48}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();

export async function digest(token){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token)))]
  .map(n=>n.toString(16).padStart(2,'0')).join('');
}
function equals(a,b){
 let delta=0;
 for(let i=0;i<a.length;i++)delta|=a.charCodeAt(i)^b.charCodeAt(i);
 return delta===0;
}
function bodyText(bytes){
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
function response(value,status,origin){
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'vary':'Origin','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"};
 if(origin)headers['access-control-allow-origin']=origin;
 return Response.json(value,{status,headers});
}
function github(token,branch,transport){
 const api='https://api.github.com/repos/'+repoName;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
  'User-Agent':'moje-ogrzewanie-journal','X-GitHub-Api-Version':'2022-11-28'};
 // Workers supports manual redirects. Callers reject every non-success status.
 const request=(url,settings={})=>transport(url,{cache:'no-store',redirect:'manual',
  ...settings,headers:{...headers,...settings.headers}});
 return {
  async load(){
   const repo=await request(api);
   if(!repo.ok)throw Error('Brak dostępu do prywatnego repozytorium.');
   const info=await repo.json();
   if(info.full_name!==repoName||info.private!==true||info.visibility!=='private'||info.archived)throw Error('Archiwum niedostępne.');
   const reply=await request(api+'/contents/'+path+'?ref='+encodeURIComponent(branch));
   // The file is provisioned deliberately. A missing ref or revoked scope cannot create a new ledger.
   if(!reply.ok)throw Error('Brak dziennika w prywatnym archiwum.');
   const body=await reply.json();
   if(body.type!=='file'||body.encoding!=='base64'||!/^[a-f0-9]{40}$/.test(body.sha)||
      typeof body.content!=='string'||body.content.length>1000000)throw Error('Nieprawidłowa zawartość archiwum.');
   const json=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(body.content.replace(/\s/g,'')),x=>x.charCodeAt(0)));
   return {archive:model.validate(JSON.parse(json)),sha:body.sha};
  },
  async write(archive,sha){
   const reply=await request(api+'/contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:'sync: dopisz rewizję dziennika',branch,sha,
     content:bodyText(encoder.encode(JSON.stringify(archive)+'\n'))})});
   if([409,422].includes(reply.status))return false;
   if(!reply.ok)throw Error('Prywatny zapis GitHuba niedostępny.');
   return true;
  }
 };
}

// Dependency options are for isolated tests. The deployed entrypoint always uses private main.
export function createJournalHandler({branch='main',transport=fetch}={}) {
 return async (request,env)=>{
  const origin=request.headers.get('origin');
  if(origin&&origin!==env.ALLOWED_ORIGIN)return response({error:'Niedozwolone pochodzenie.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Vary':'Origin',
   ...(origin?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
   'Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'600'}});
  if(!['GET','POST'].includes(request.method))return response({error:'Metoda niedozwolona.'},405,origin);
  const read=env.JOURNAL_READ_TOKEN_SHA256,write=env.JOURNAL_WRITE_TOKEN_SHA256,secret=env.JOURNAL_GITHUB_TOKEN;
  if(!secret||!env.ALLOWED_ORIGIN||!digestPattern.test(read||'')||!digestPattern.test(write||'')||read===write)
   return response({error:'Dziennik nie został uruchomiony.'},503,origin);
  const token=/^Bearer ([a-f0-9]{48})$/.exec(request.headers.get('authorization')||'')?.[1];
  const hashed=token&&tokenPattern.test(token)?await digest(token):'';
  const role=hashed&&equals(hashed,write)?'write':hashed&&equals(hashed,read)?'read':null;
  if(!role||role==='read'&&request.method==='POST')return response({error:'Brak uprawnień do dziennika.'},401,origin);
  const store=github(secret,branch,transport);
  if(request.method==='GET'){
   try{
    const result=await store.load();
    return response({role,archive:result.archive},200,origin);
   }catch{return response({error:'Prywatne archiwum niedostępne.'},502,origin);}
  }
  let entry;
  try{
   const type=request.headers.get('content-type')?.split(';')[0];
   if(type!=='application/json')return response({error:'Wymagany JSON.'},415,origin);
   const reader=request.body?.getReader();
   const decoder=new TextDecoder('utf-8',{fatal:true});
   let total=0;const parts=[];
   if(!reader)throw Error('Brak treści.');
   for(;;){
    const next=await reader.read();
    if(next.done)break;
    total+=next.value.length;
    if(total>50000){await reader.cancel();return response({error:'Zapis jest zbyt duży.'},413,origin);}
    parts.push(decoder.decode(next.value,{stream:true}));
   }
   const value=JSON.parse(parts.join('')+decoder.decode());
   entry=model.revision(value);
   if(entry.source!=='iphone')throw Error('Nieprawidłowe pochodzenie.');
  }catch{return response({error:'Nieprawidłowa rewizja dziennika.'},400,origin);}
  for(let attempt=0;attempt<4;attempt++){
   let current;
   try{current=await store.load();}
   catch{return response({error:'Prywatne archiwum niedostępne.'},502,origin);}
   try{
    const next=model.append(current.archive,entry);
    if(!next.added||await store.write(next.archive,current.sha))return response({ok:true,id:entry.id},200,origin);
   }catch(error){
    if(error.status===409)return response({error:error.message},409,origin);
    if(error.status===413)return response({error:error.message},413,origin);
    return response({error:'Nie udało się zapisać prywatnego dziennika.'},502,origin);
   }
  }
  return response({error:'Archiwum jest zajęte. Spróbujemy ponownie.'},503,origin);
 };
}
