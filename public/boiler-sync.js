'use strict';
// Pairing is stored per browser and never becomes part of the journal or its exports.
const BoilerSync=(()=>{
 const KEY='moje-ogrzewanie-boiler-connection-v1';
 let connection=null,record=null,busy=false,fresh=false,message='';
 function credentials(host,key){
   const url=new URL(host.trim());
   if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.port||url.username||url.password||
       url.pathname!=='/'||url.search||url.hash||!/^[0-9a-f]{64}$/.test(key))throw Error('Sprawdź prywatny adres HTTPS i klucz nastawy CO.');
   return {host:url.origin,key};
 }
 function restore(){
   try{
     const saved=JSON.parse(localStorage.getItem(KEY));
     if(saved)connection=credentials(saved.host,saved.key);
   }catch(_){message='Nie można odczytać połączenia nastawy CO.';}
 }
 async function request(candidate,method='GET',data){
   let response;
   try{
     response=await fetch(candidate.host+'/api/boiler_note/v1',{
       method,cache:'no-store',credentials:'omit',redirect:'error',
       signal:AbortSignal.timeout(7000),
       headers:{Authorization:'Bearer '+candidate.key,...(data?{'Content-Type':'application/json'}:{})},
       ...(data?{body:JSON.stringify(data)}:{})
     });
   }catch(_){throw Error('Brak połączenia z prywatnym Home Assistant.');}
   if(response.status===401)throw Error('Home Assistant odrzucił klucz nastawy CO.');
   if(response.status===409){const err=Error('Nastawa zmieniła się w innym miejscu. Odśwież ją przed ponownym zapisem.');err.conflict=true;throw err;}
   if(!response.ok)throw Error('Home Assistant nie potwierdził zapisu ani odczytu.');
   const note=await response.json();
   if(!note||!Number.isSafeInteger(note.revision)||note.revision<0||
      (note.value===null?(note.revision!==0||note.updated_at!==null):
       (!Number.isInteger(note.value)||note.value<25||note.value>85||note.revision<1||
        typeof note.updated_at!=='string'||!Number.isFinite(Date.parse(note.updated_at)))))throw Error('Nieprawidłowa odpowiedź Home Assistant.');
   return note;
 }
 async function run(operation){
   if(busy)throw Error('Poczekaj na zakończenie odczytu lub zapisu.');
   busy=true;
   try{
     const note=await operation();
     record=note;fresh=true;message='';
     return note;
   }catch(error){fresh=false;message=error.message;throw error;}finally{busy=false;}
 }
 function connect(host,key){
   const candidate=credentials(host,key.trim().toLowerCase());
   return run(async()=>{
     const note=await request(candidate);
     localStorage.setItem(KEY,JSON.stringify(candidate));
     connection=candidate;
     return note;
   });
 }
 function refresh(){
   if(!connection||busy)return Promise.resolve(null);
   return run(()=>request(connection));
 }
 function write(value,revision){
   if(!connection||!fresh||!record)return Promise.reject(Error('Odśwież nastawę CO przed zapisem. Brak zapisu w Home Assistant.'));
   if(revision!==record.revision){const err=Error('Nastawa zmieniła się. Sprawdź bieżącą wartość przed zapisem.');err.conflict=true;return Promise.reject(err);}
   return run(async()=>{
     const note=await request(connection,'PUT',{value,revision});
     if(note.value!==value)throw Error('Home Assistant nie potwierdził oczekiwanej wartości.');
     return note;
   });
 }
 function status(){return {paired:!!connection,busy,fresh,record,message,host:connection?.host||''};}
 restore();
 return {connect,refresh,write,status};
})();
