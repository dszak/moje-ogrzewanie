'use strict';
// Private, deterministic report builder. Produces a local export; no network or device control.
const HeatingReview=(()=>{
  const HOUR=3600000,DAY=24*HOUR;
  const PERIODS={day:{hours:24,label:'Ostatnie 24 godziny'},week:{hours:168,label:'Ostatnie 7 dni'},month:{hours:720,label:'Ostatnie 30 dni'}};
  const ROOMS={bedroom:'Sypialnia',salon:'Salon',kitchen:'Kuchnia',bigbath:'Duża łazienka',smallbath:'Mała łazienka',hall:'Przedpokój'};
  const iso=ms=>new Date(ms).toISOString();
  const round=(v,n=2)=>Math.round(v*10**n)/10**n;
  const inWindow=(at,start,end)=>Number.isFinite(at)&&at>=start&&at<=end;
  function bounds(key,at=Date.now()){
    if(!Object.prototype.hasOwnProperty.call(PERIODS,key))throw Error('Wybierz okres raportu.');
    if(!Number.isFinite(at))throw Error('Błędna data raportu.');
    return {key,label:PERIODS[key].label,start:at-PERIODS[key].hours*HOUR,end:at,hours:PERIODS[key].hours};
  }
  function build(state,key,sources={},at=Date.now()){
    const {start,end,label,hours}=bounds(key,at),created=iso(at);
    // Include each series' most recent *earlier* value as context, never as an observation in the period.
    const histories=[],temperatures=(state.temperatureHistory||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    for(const [room,name] of Object.entries(ROOMS)){
      const all=temperatures.filter(r=>r.room===room);
      const within=all.filter(r=>inWindow(Date.parse(r.at),start,end)).map(r=>({at:r.at,temp_c:r.temp}));
      const before=all.filter(r=>Date.parse(r.at)<start).at(-1);
      histories.push({room,name,observations:within,previous_known_value:before?{at:before.at,temp_c:before.temp}:null,
        count:within.length,min_c:within.length?Math.min(...within.map(v=>v.temp_c)):null,
        max_c:within.length?Math.max(...within.map(v=>v.temp_c)):null});
    }
    const engoAll=(state.engoCycles||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const engoInWindow=engoAll.filter(e=>inWindow(Date.parse(e.at),start,end)).map(e=>({at:e.at,status:e.status}));
    const engoBefore=engoAll.filter(e=>Date.parse(e.at)<start).at(-1);
    const analyzed=EngoCycles.analyze(engoAll);
    const completePairs=analyzed.pairs.filter(p=>Date.parse(p.start)>=start&&Date.parse(p.end)<=end).map(p=>({
      on:p.start,off:p.end,minutes:p.minutes
    }));
    const overlappingPairs=analyzed.pairs.filter(p=>Date.parse(p.start)<end&&Date.parse(p.end)>start).map(p=>({
      on:p.start,off:p.end,
      minutes_in_period:round((Math.min(Date.parse(p.end),end)-Math.max(Date.parse(p.start),start))/60000,1),
      fully_within_period:Date.parse(p.start)>=start&&Date.parse(p.end)<=end
    }));
    const gasAll=[
      ...(state.gasHistory||[]).map(r=>({at:r.at,meter:r.meter,gas_m3:r.gas,source:r.source})),
      ...(state.conditions||[]).filter(r=>typeof r.gas==='number'&&Number.isFinite(r.gas)).map(r=>({
        at:r.at,meter:r.meter||'new',gas_m3:r.gas,source:'obserwacja'
      }))
    ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const gasMeter={};
    for(const meter of ['old','new']){
      const all=gasAll.filter(r=>r.meter===meter),selected=all.filter(r=>inWindow(Date.parse(r.at),start,end));
      const before=all.filter(r=>Date.parse(r.at)<start).at(-1);
      const between=[];
      for(let i=1;i<selected.length;i++){
        const a=selected[i-1],b=selected[i],elapsed=(Date.parse(b.at)-Date.parse(a.at))/HOUR;
        if(elapsed<=0)continue;
        const change=round(b.gas_m3-a.gas_m3,3);
        if(change>=0)between.push({from:a.at,to:b.at,hours:round(elapsed,2),total_gas_m3:change,
          note:'Cały gaz licznika: ogrzewanie + ciepła woda + inne odbiorniki'});
      }
      gasMeter[meter]={readings:selected,previous_known_reading:before||null,intervals_between_readings_in_period:between};
    }
    const weather=(state.weather?.hourly||[]).filter(h=>inWindow(h.at*1000,start,end)).sort((a,b)=>a.at-b.at);
    const weatherRows=weather.map(h=>({at:iso(h.at*1000),temp_c:h.temp}));
    const weatherExpected=Math.ceil((end-start)/HOUR);
    const boilers=(state.boilerReadings||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const boilerBefore=boilers.filter(r=>Date.parse(r.at)<start).at(-1);
    const boilerInWindow=boilers.filter(r=>inWindow(Date.parse(r.at),start,end)).map(r=>({
      at:r.at,ac001_powered_hours:r.ac001,ac005_heating_counter_raw:r.ac005,ac006_hot_water_counter_raw:r.ac006,
      note:r.note||''
    }));
    const settings=(state.global||{});
    const settingsChanges=(state.heatingEvents||[]).filter(e=>inWindow(Date.parse(e.at),start,end)).map(e=>({
      at:e.at,engo_setpoint_c:e.engo,note:e.note||''
    }));
    const manualTemperature=Object.entries(ROOMS).flatMap(([room])=>(state.rooms?.[room]?.readings||[]).filter(
      r=>inWindow(Date.parse(r.at),start,end)).map(r=>({room,at:r.at,temp_c:r.temp,humidity_percent:r.humidity,note:r.note||''})));
    const experiments=(state.experiments||[]).filter(e=>
      e.status==='active'||inWindow(Date.parse(e.started),start,end)||e.ended&&inWindow(Date.parse(e.ended),start,end))
      .map(e=>({id:e.id,title:e.title,description:e.description,status:e.status,started:e.started,
        ...(e.ended?{ended:e.ended}:{}),...(e.notes?{notes:e.notes}:{})}));
    const decisions=(state.decisionLog||[]).filter(d=>inWindow(Date.parse(d.at),start,end)).map(d=>({
      at:d.at,assessment:d.assessment,choice:d.choice,action:d.action,review_on:d.reviewOn,
      experiment_id:d.experimentId,settings_at_decision:d.settings
    }));
    const quality=[];
    if(!histories.some(h=>h.count))quality.push('Brak zmian temperatury MQTT w wybranym okresie.');
    if(!completePairs.length)quality.push('Brak pełnych cykli ENGO w obrębie wybranego okresu; nie szacuj czasu grzania.');
    if(!gasMeter.new.intervals_between_readings_in_period.length&&!gasMeter.old.intervals_between_readings_in_period.length)
      quality.push('Brak dwóch kolejnych odczytów tego samego gazomierza w okresie — zużycie gazu nieznane.');
    if(weatherRows.length/weatherExpected<0.75)quality.push('Dostępność godzinowej pogody poniżej 75% — nie dokonuj porównań pogodowych.');
    quality.push('Cykle ENGO to zapotrzebowanie termostatu, a NIE zmierzony czas palnika.');
    quality.push('Historia MQTT rejestruje zmiany wartości; liczba zapisów nie jest liczbą wszystkich fizycznych pomiarów.');
    quality.push('AC001 oznacza godziny zasilania elektrycznego kotła, nie czas pracy palnika. AC005/AC006 to surowe liczniki.');
    quality.push('Nie wyciągaj wniosków o sprawności kotła bez danych o rzeczywistej energii i warunkach pracy.');
    const setti=sources.setti||null,heads=sources.heads||null;
    const report={
      format:'moje-ogrzewanie-analiza',format_version:1,created_at:created,timezone:'Europe/Warsaw',
      period:{key,label,start:iso(start),end:created,hours},
      method:'WIDZIEĆ → OCENIĆ → DZIAŁAĆ',
      instructions_for_analysis:'Oddziel fakty od hipotez. Oceń komfort, stabilność i możliwą bezwładność cieplną, wpływ pogody oraz gaz. Wskaż brakujące dane, nie utożsamiaj ENGO z palnikiem. Zakończ: zachować ustawienia / zebrać dane / zaproponować jeden bezpieczny eksperyment do zatwierdzenia.',
      settings_at_export:{boiler_supply_setpoint_c:settings.boiler,engo_setpoint_c:settings.engo,
        engo_last_manual_reading_c:settings.engoCurrent,
        room_targets_c:Object.fromEntries(Object.keys(ROOMS).map(id=>[id,state.rooms?.[id]?.target??null])),
        manually_recorded_radiator_targets_c:{...(state.radiators||{})},
        electric_radiator_status_manual:settings.electric},
      temperature_history:{source:'Home Assistant, Setti+ MQTT, historia zmian',rooms:histories},
      engo:{source:'Ręcznie przepisany dziennik ENGO Smart',events:engoInWindow,
        previous_event_before_period:engoBefore?{at:engoBefore.at,status:engoBefore.status}:null,
        completed_pairs_fully_in_period:completePairs,completed_minutes_fully_in_period:round(completePairs.reduce((sum,p)=>sum+p.minutes,0),1),
        overlapping_completed_pairs:overlappingPairs,missing_pair_count_in_all_imported_data:analyzed.incomplete},
      gas:{meters:gasMeter,includes_dhw_and_other_use:true},
      outdoor_weather:{source:'Open-Meteo, model hourly, not a station measurement',updated_at:state.weather?.updated||null,
        hours_available:weatherRows.length,hours_expected:weatherExpected,coverage_percent:round(100*weatherRows.length/weatherExpected,1),
        hourly:weatherRows},
      boiler_counters:{source:'Ręczne odczyty BRÖTJE',
        readings:boilerInWindow,previous_known_reading:boilerBefore?{
          at:boilerBefore.at,ac001_powered_hours:boilerBefore.ac001,
          ac005_heating_counter_raw:boilerBefore.ac005,ac006_hot_water_counter_raw:boilerBefore.ac006
        }:null},
      manual_temperature_readings:manualTemperature,engo_setpoint_history:settingsChanges,experiments,
      prior_decisions_in_period:decisions,
      latest_live_status:{setti:setti?{data:setti.data||null,fresh:!!setti.fresh,at:setti.at||null}:null,
        radiator_heads:heads?{data:heads.data||null,fresh:!!heads.fresh,at:heads.at||null}:null,
        note:'Migawki z chwili tworzenia raportu, a nie historyczne odczyty w analizowanym okresie.'},
      interpretation_limitations:quality
    };
    report.readable_summary=summary(report);
    return report;
  }
  function summary(r){
    const rows=r.temperature_history.rooms,counts=rows.filter(x=>x.count>0).map(x=>
      x.name+': '+x.count+' zmian, min '+x.min_c+'°C, maks '+x.max_c+'°C');
    const gasCount=Object.values(r.gas.meters).reduce((n,g)=>n+g.readings.length,0);
    const weather=r.outdoor_weather;
    return [
      'RAPORT „MOJE OGRZEWANIE” — WIDZIEĆ / OCENIĆ / DZIAŁAĆ',
      'Utworzony: '+r.created_at+' (UTC), strefa prezentacji: Europe/Warsaw',
      'Okres: '+r.period.label+' ('+r.period.start+' — '+r.period.end+')',
      'Nastawy zapisane ręcznie: ENGO '+r.settings_at_export.engo_setpoint_c+'°C, kocioł '+r.settings_at_export.boiler_supply_setpoint_c+'°C.',
      'TEMPERATURY: '+rows.reduce((sum,x)=>sum+x.count,0)+' zmian MQTT w okresie.',
      ...counts,
      'ENGO: '+r.engo.events.length+' zdarzeń; '+r.engo.completed_pairs_fully_in_period.length+
        ' pełnych cykli w okresie, łącznie '+r.engo.completed_minutes_fully_in_period+' min zapotrzebowania.',
      'GAZ: '+gasCount+' odczytów w okresie; nie przypisuj całego zużycia ogrzewaniu.',
      'POGODA: '+weather.hours_available+'/'+weather.hours_expected+' godzin modelu Open-Meteo ('+weather.coverage_percent+'%).',
      'LICZNIKI KOTŁA: '+r.boiler_counters.readings.length+' odczytów w okresie.',
      'OGRANICZENIA:',
      ...r.interpretation_limitations.map(t=>'– '+t),
      'PYTANIE DO CHATGPT: Co można stwierdzić, czego nie wiemy i jaki jest następny rozsądny krok?'
    ].join('\n');
  }
  return {build,bounds,summary,PERIODS,ROOMS};
})();
