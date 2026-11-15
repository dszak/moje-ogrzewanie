'use strict';
// Public read-only radiator head readings. No Tuya credentials, no device control.
const Heads = (() => {
  const URL = 'https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/glowice.json';
  const IDS = Array.from({length: 8}, (_, i) => 'g' + (i + 1));
  const MAX_AGE_MS = 20 * 60 * 1000;
  let latest = null;

  function parse(data) {
    if (!data || data.version !== 1 || typeof data.last_sync !== 'string' ||
        !Number.isFinite(Date.parse(data.last_sync)) ||
        !data.heads || typeof data.heads !== 'object' || Array.isArray(data.heads)) {
      throw Error('Nieprawidłowe dane głowic');
    }
    const heads = {};
    for (const id of IDS) {
      const h = data.heads[id];
      if (!h || typeof h !== 'object' || Array.isArray(h) ||
          typeof h.temperature !== 'number' || !Number.isFinite(h.temperature) ||
          h.temperature < -10 || h.temperature > 45 ||
          typeof h.target_temperature !== 'number' || !Number.isFinite(h.target_temperature) ||
          h.target_temperature < 5 || h.target_temperature > 35 ||
          typeof h.calibration !== 'number' || !Number.isFinite(h.calibration) ||
          h.calibration < -20 || h.calibration > 20 ||
          typeof h.mode_raw !== 'string' || h.mode_raw.length > 40) {
        throw Error('Nieprawidłowy odczyt głowicy: ' + id);
      }
      heads[id] = {temperature: h.temperature, target_temperature: h.target_temperature,
                   calibration: h.calibration, mode_raw: h.mode_raw};
    }
    return {version: 1, last_sync: data.last_sync, heads};
  }

  function isFresh(data, nowMs = Date.now()) {
    if (!data) return false;
    const age = nowMs - Date.parse(data.last_sync);
    return Number.isFinite(age) && age >= -60000 && age <= MAX_AGE_MS;
  }

  // The latest snapshot can be stale; the UI must explicitly show the status.
  function lastSnapshot() {
    return latest ? JSON.parse(JSON.stringify(latest)) : null;
  }

  function head(id, nowMs = Date.now()) {
    if (!isFresh(latest, nowMs)) return null;
    const h = latest.heads[String(id).toLowerCase()];
    return h ? {...h, at: latest.last_sync} : null;
  }

  function status(nowMs = Date.now()) {
    if (isFresh(latest, nowMs)) return {ok: true, label: 'Odczyty aktualne', at: latest.last_sync};
    if (latest) return {ok: false, label: 'Odczyty nieaktualne (ponad 20 minut)', at: latest.last_sync};
    return {ok: false, label: 'Brak odczytów głowic', at: null};
  }

  async function refresh(fetcher, nowMs = Date.now()) {
    try {
      if (typeof fetcher !== 'function') return false;
      const response = await fetcher(URL + '?t=' + nowMs, {cache: 'no-store'});
      if (!response || !response.ok) throw Error('Nie udało się pobrać danych głowic');
      const data = parse(await response.json());
      latest = data;
      return isFresh(data, nowMs);
    } catch (_) {
      // Never replace the last valid snapshot with a failed or invalid response.
      return false;
    }
  }

  return {parse, isFresh, lastSnapshot, head, status, refresh};
})();
