'use strict';

// This script is added only to the isolated HTTPS acceptance build.
const HeatingPreview = (() => {
  const archiveKey = 'ogrzewanie-review-gas-v1';
  const failureKey = 'ogrzewanie-review-failure';
  const read = () => JSON.parse(localStorage.getItem(archiveKey) || '{"readings":[],"seen":[]}');
  const write = result => localStorage.setItem(archiveKey, JSON.stringify(result));
  const response = (data, status=200) => new Response(JSON.stringify(data), {status});
  const hour = 3600000;
  const iso = ms => new Date(ms).toISOString();
  const roomTemperatures = {bedroom:21.9,salon:22.4,kitchen:21.5,bigbath:21.1,smallbath:19.8,hall:20.7};

  function roomSnapshot(at) {
    return {version:1,last_sync:at,rooms:Object.fromEntries(
      Object.entries(roomTemperatures).map(([id,temperature],i) => [id,{temperature,humidity:45+i*3}])
    )};
  }

  function headSnapshot(at) {
    return {version:1,last_sync:at,heads:Object.fromEntries(HeatingBoard.windows.map((id,i) => [
      id.toLowerCase(),{temperature:20.2+0.4*i,target_temperature:i<2?22:21.5,calibration:i%3-1,mode_raw:'manual'}
    ]))};
  }

  function seedReview(base) {
    if (localStorage.getItem('moje-ogrzewanie-data-v1')) return;
    const next=seed();
    next.global.boiler=54;
    next.coHistory=[{id:'co-test',at:iso(base-36*hour),value:54,source:'manual'}];
    const start=base-18*hour;
    next.gasHistory=Array.from({length:44},(_,i) => ({
      id:'g-test-'+i,at:iso(start-(43-i)*18*hour),gas:Number((21.6+2.4*i).toFixed(3)),meter:'new',source:'manual'
    }));
    next.gasHistory.unshift({id:'g-test-old',at:iso(base-36*24*hour),gas:90,meter:'old',source:'manual'});
    next.boilerReadings=[
      {id:'b-test-1',at:iso(base-42*hour),ac001:18340,ac005:3210,ac006:980,note:''},
      {id:'b-test-2',at:iso(base-18*hour),ac001:18364,ac005:3237,ac006:994,note:''}
    ];
    next.temperatureHistory=Array.from({length:24},(_,i)=>Object.entries(roomTemperatures).map(([room,temp])=>({
      at:iso(base-(24-i)*hour),room,temp:Number((temp+0.3*Math.sin(i/2)).toFixed(1))
    }))).flat();
    next.rooms.salon.target=22;
    next.rooms.smallbath.target=21;
    state=next;
    save();
  }

  function panel() {
    const nav=document.getElementById('nav');
    if (document.getElementById('review-network')) return;
    const section=document.createElement('details');
    section.id='review-network';section.className='wrap hint';
    section.style.cssText='padding-top:4px;padding-bottom:0';
    section.innerHTML='<summary>Test połączenia z archiwum</summary><label><input style="width:18px;min-height:18px;vertical-align:middle" type="checkbox" id="review-network-off"> Symuluj błąd synchronizacji gazu</label><p>Odczyty i kopia testowa pozostają w tej przeglądarce.</p>';
    nav.closest('header').after(section);
    const toggle=document.getElementById('review-network-off');
    toggle.checked=localStorage.getItem(failureKey)==='on';
    toggle.addEventListener('change',()=>{
      localStorage.setItem(failureKey,toggle.checked?'on':'off');
      if (!toggle.checked) maybeSyncGas();
    });
  }

  let lastContact = null;
  let disconnected = false;
  let readingDevices = false;

  function updateStatus() {
    const line=document.querySelector('[data-preview-telemetry]');
    if(!line)return;
    if(disconnected)line.textContent='Odczyty instalacji niedostępne'+(lastContact?' · zachowano ostatni odczyt z '+HeatingBoard.when(lastContact):'')+'.';
    else line.textContent=lastContact?'Odczyty z Home Assistant · pobrano '+HeatingBoard.when(lastContact)+'.':'Pobieram odczyty z Home Assistant…';
  }

  async function readDevices() {
    if(readingDevices||document.visibilityState==='hidden')return;
    readingDevices=true;
    try {
      const reply=await fetch('./api/telemetry',{cache:'no-store'});
      if(!reply.ok)throw Error('Odczyty niedostępne.');
      const payload=HaSync.validate(await reply.json());
      if(!payload.dashboard)throw Error('Brak migawki.');
      haSnapshot=payload.dashboard;
      lastContact=payload.generatedAt;
      disconnected=false;
    } catch {
      disconnected=true;
    } finally {
      readingDevices=false;
    }
    renderGasWhenIdle();
    updateStatus();
  }

  async function start() {
    const base=Math.floor(Date.now()/60000)*60000;
    const at=iso(base);
    panel();
    const originalFetch=window.fetch;
    window.fetch=async (input,options={})=>{
      const url=new URL(input,location.href);
      if(url.pathname.endsWith('/v1/gas')&&options.headers?.Authorization==='Bearer '+'0'.repeat(48)){
        if(localStorage.getItem(failureKey)==='on')throw Error('Symulowana utrata połączenia');
        const archive=read();
        if(options.method==='POST'){
          const seen=new Set(archive.seen);
          const records=new Map(archive.readings.map(row=>[row.id,row]));
          for(const event of JSON.parse(options.body).events){
            if(seen.has(event.id))continue;
            seen.add(event.id);
            if(event.op==='delete')records.delete(event.record_id);
            else records.set(event.record_id,{id:event.record_id,...event.reading});
          }
          write({readings:[...records.values()],seen:[...seen]});
          return response({ok:true});
        }
        return response({schema_version:1,readings:archive.readings});
      }
      if(url.pathname.endsWith('/pomiary.json'))return response(roomSnapshot(at));
      if(url.pathname.endsWith('/glowice.json'))return response(headSnapshot(at));
      if(url.hostname===location.hostname&&url.origin===location.origin)return originalFetch(input,options);
      return response({},403);
    };
    seedReview(base);
    if(!state.weather.hourly.length){
      const aligned=Math.floor(base/hour)*hour;
      state.weather={updated:at,hourly:Array.from({length:35*24+1},(_,i)=>({
        at:(aligned-(35*24-i)*hour)/1000,temp:Number((4+1.6*Math.cos(i/10)).toFixed(1))
      }))};
      save();
    }
    await Promise.all([Setti.refresh(window.fetch),Heads.refresh(window.fetch)]);
    render();
    readDevices();
    window.setInterval(readDevices,30000);
    window.addEventListener('online',readDevices);
    document.addEventListener('visibilitychange',readDevices);
    try{
      if(!await GasSync.restore()){
        await GasSync.connect('write','0'.repeat(48));
        await GasSync.activate();
      }
      await maybeSyncGas();
    }catch(error){toast(error.message);}
  }

  return {start, updateStatus, devicePlaceholder:{engo:{target:null,measured:null},bath:{}},
    label:'Wersja testowa · rzeczywiste odczyty ENGO, konwektora i gniazdka',
    status:'<p class="hint" role="status" data-preview-telemetry></p><p class="hint">Pozostałe dane są przykładowe.</p>'
  };
})();
