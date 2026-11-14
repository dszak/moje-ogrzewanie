'use strict';
// Public, read-only Setti+ measurements. Never send credentials from the browser.
const Setti = (() => {
  const URL = 'https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/pomiary.json';
  const ROOM_IDS = ['bedroom', 'salon', 'kitchen', 'bigbath', 'smallbath', 'hall'];
  const MAX_AGE_MS = 20 * 60 * 1000;
  let latest = null;

  function parse(data) {
    if (!data || data.version !== 1 || typeof data.last_sync !== 'string' ||
        !Number.isFinite(Date.parse(data.last_sync)) ||
        !data.rooms || typeof data.rooms !== 'object') {
      throw Error('Nieprawidłowe dane Setti+');
    }
    const rooms = {};
    for (const id of ROOM_IDS) {
      const r = data.rooms[id];
      if (!r || typeof r.temperature !== 'number' || !Number.isFinite(r.temperature) ||
          r.temperature < -10 || r.temperature > 45 ||
          typeof r.humidity !== 'number' || !Number.isFinite(r.humidity) ||
          r.humidity < 0 || r.humidity > 100) {
        throw Error('Nieprawidłowy pomiar Setti+: ' + id);
      }
      rooms[id] = {temperature: r.temperature, humidity: r.humidity};
    }
    return {version: 1, last_sync: data.last_sync, rooms};
  }

  function isFresh(data, nowMs = Date.now()) {
    if (!data) return false;
    const age = nowMs - Date.parse(data.last_sync);
    return Number.isFinite(age) && age >= -60000 && age <= MAX_AGE_MS;
  }

  function snapshot(nowMs = Date.now()) {
    return isFresh(latest, nowMs) ? JSON.parse(JSON.stringify(latest)) : null;
  }

  function room(id, nowMs = Date.now()) {
    const data = snapshot(nowMs);
    const r = data?.rooms[id];
    return r ? {temp: r.temperature, humidity: r.humidity, at: data.last_sync} : null;
  }

  function status(nowMs = Date.now()) {
    if (isFresh(latest, nowMs)) return {ok: true, label: 'Pomiary aktualne', at: latest.last_sync};
    if (latest) return {ok: false, label: 'Pomiary nieaktualne (ponad 20 minut)', at: latest.last_sync};
    return {ok: false, label: 'Brak automatycznych pomiarów', at: null};
  }

  async function refresh(fetcher, nowMs = Date.now()) {
    try {
      if (typeof fetcher !== 'function') return false;
      const response = await fetcher(URL + '?t=' + nowMs, {cache: 'no-store'});
      if (!response || !response.ok) throw Error('Nie udało się pobrać pomiarów');
      latest = parse(await response.json());
      return isFresh(latest, nowMs);
    } catch (_) {
      // Never overwrite a fresh previous reading with a failed network response.
      return false;
    }
  }

  return {parse, isFresh, snapshot, room, status, refresh};
})();
