'use strict';

const HeatingBoard = (() => {
  const hour = 3600000;
  const day = 24 * hour;
  const clock = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const display = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short'
  });
  const keys = ['ac001', 'ac005', 'ac006'];
  const names = {ac001:'Godziny zasilania',ac005:'Centralne ogrzewanie',ac006:'Ciepła woda'};
  const windows = Array.from({length:8}, (_, i) => 'G'+(i+1));
  const openings = ['', 'Lekkie uchylenie', 'Uchylone', 'Otwarte szeroko'];

  function local(at, seconds=false) {
    return clock.format(new Date(at)).replace(' ', 'T').slice(0, seconds ? 19 : 16);
  }

  function parseLocal(value, offset='') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return NaN;
    const input = value.length===16 ? value+':00' : value;
    const offsets = offset ? [offset] : ['+01:00','+02:00'];
    const matches = offsets.map(zone => Date.parse(input+zone))
      .filter(at => Number.isFinite(at) && local(at,true)===input);
    return matches.length===1 ? matches[0] : NaN;
  }

  function when(at) {
    return Number.isFinite(new Date(at).valueOf()) && at!==null ? display.format(new Date(at)) : '—';
  }

  function elapsed(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    return minutes < 1 ? '< 1 min' : (minutes >= 60 ? Math.floor(minutes/60)+' h ' : '')+(minutes%60)+' min';
  }

  function fresh(at, now, minutes=20) {
    const age=now-Date.parse(at);
    return Number.isFinite(age) && age>=-60000 && age<=minutes*60000;
  }

  function gas(state, now=Date.now()) {
    const readings=Insights.readings(state).filter(row=>row.at<=now);
    const latest=readings.at(-1) || null;
    const meter=latest?.meter;
    const intervals=Insights.intervals(state).filter(row=>row.meter===meter && row.end<=now);
    const last = latest && intervals.find(row=>row.end===latest.at) || null;
    // A comparison cannot cross a reset or a disputed reading.
    const previous=last && intervals.find(row=>row.end===last.start &&
      Math.abs(row.days-last.days)<=last.days*0.10 &&
      !(row.avg!==null&&last.avg!==null&&Math.abs(row.avg-last.avg)>2)) || null;
    const comparison=previous && previous.perDay>0 ? {
      previous, percent:(last.perDay/previous.perDay-1)*100,
      weather:previous.avg!==null&&last.avg!==null
    } : null;
    const rolling=[7,30].map(days=>{
      const start=now-days*day;
      const measured=intervals.filter(row=>row.start>=start);
      const covered=measured.reduce((acc,row)=>acc+row.days,0);
      const total=measured.reduce((acc,row)=>acc+row.gas,0);
      return {days, covered, perDay:covered ? total/covered : null};
    });
    return {latest,last,comparison,rolling};
  }

  function precedingGas(state,meter,at) {
    const list=Insights.readings(state).filter(r=>r.meter===meter&&r.at<at);
    const previous=list.at(-1);
    if (!previous || list.some(r=>r.at===previous.at&&r.gas!==previous.gas)) return null;
    return previous;
  }

  function counters(readings, at=Infinity, exclude=null) {
    const entries=(readings||[]).filter(row => Date.parse(row.at)<at&&row.id!==exclude)
      .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    return keys.map(key=>{
      const actual=entries.filter(row=>Number.isSafeInteger(row[key])).slice(0,2);
      const [last,previous]=actual;
      return {key, latest:last?.[key]??null, at:last?.at??null,
        gain:last&&previous&&last[key]>=previous[key]?last[key]-previous[key]:null,
        reset:!!(last&&previous&&last[key]<previous[key])};
    });
  }

  function model(state, gasState, live, now=Date.now()) {
    const available=live.rooms.map(r=>r.temp).filter(Number.isFinite);
    const engo=live.snapshot?.engo;
    const history=(state.engoCycles||[]).filter(x=>['on','off'].includes(x.status))
      .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
    const demand=engo&&['on','off'].includes(engo.demand)&&(!history||Date.parse(engo.demandAt)>=Date.parse(history.at))
      ? {status:engo.demand,at:engo.demandAt,source:'Home Assistant'}
      : history ? {...history,source:history.source==='ha-auto'?'Home Assistant':'Import ENGO'} : null;
    const air=(state.ventilation||[]).find(item=>!item.ended);
    const temperatureSource=engo?'Home Assistant':'Dziennik ręczny';
    return {
      gas:gas(gasState,now), counters:counters(state.boilerReadings),
      co:{value:state.global.boiler,at:state.coHistory?.at(-1)?.at??null},
      mean:available.length?available.reduce((s,x)=>s+x,0)/available.length:null,
      count:available.length, ...live, demand, air, temperatureSource,
      target:engo?engo.target:state.global.engo, measured:engo?engo.measured:state.global.engoCurrent,
      engoAt:engo?.observedAt??null, now
    };
  }

  return {gas,precedingGas,counters,model,local,parseLocal,when,elapsed,fresh,keys,names,windows,openings};
})();
