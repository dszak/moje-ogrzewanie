"""Capture allowlisted readings from the existing read-only data sources."""

import argparse
import getpass
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")
UTC = timezone.utc
ROOMS = ("bedroom", "salon", "kitchen", "bigbath", "smallbath", "hall")
HEAD_ROOMS = dict(zip((f"G{n}" for n in range(1, 9)),
                      ("smallbath", "bigbath", "kitchen", "kitchen",
                       "salon", "salon", "bedroom", "bedroom")))
HA_SERIES = {"engo.demand", "engo.temp", "engo.target", "engo.climate", "boiler.co",
             "outdoor.met_no", "room.poll"}
HA_SERIES |= {f"{prefix}.{room}.{field}" for prefix in ("room", "room_rest")
              for room in ROOMS for field in ("temp", "rh")}
HA_SERIES |= {f"trv.{head}.{field}" for head in HEAD_ROOMS
              for field in ("temp", "target", "offset", "mode")}

SQL_RUNS = """
SELECT run_id, start AS started, end AS ended, closed_incorrect
FROM recorder_runs ORDER BY start
"""
DATA_PATH = "analityka/v1/partie"
WEATHER = "outdoor.open_meteo_icon_eu"
SAFE_WORD = re.compile(r"[a-zA-Z0-9_ -]{1,48}")


def stamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Wymagany znacznik czasu ze strefą")
    return parsed.timestamp()


def utc(value):
    return datetime.fromtimestamp(value, UTC).isoformat().replace("+00:00", "Z")


def midnight(day):
    return datetime.combine(date.fromisoformat(day), datetime.min.time(), WARSAW).timestamp()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def encode(data):
    return json.dumps(data, ensure_ascii=True, sort_keys=True, separators=(",", ":"),
                      allow_nan=False) + "\n"


def keychain(service, account=None):
    token = subprocess.check_output(
        ["/usr/bin/security", "find-generic-password", "-a", account or getpass.getuser(),
         "-s", service, "-w"], stderr=subprocess.DEVNULL, text=True, timeout=30).strip()
    if not token:
        raise RuntimeError("Brak wpisu w Pęku kluczy")
    return token


class RefuseRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, token=None, payload=None, method=None):
    headers = {"Accept": "application/json", "User-Agent": "Moje-Ogrzewanie-archiwum"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = encode(payload).encode()
    with build_opener(RefuseRedirect()).open(
            Request(url, headers=headers, data=data, method=method), timeout=75) as response:
        return json.load(response)


def ha_base(value):
    url = urlsplit(value)
    if url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise ValueError("Podaj bazowy adres Home Assistanta")
    if url.scheme == "https" and url.hostname:
        return value.rstrip("/")
    if url.scheme == "http" and url.hostname:
        host = ipaddress.ip_address(url.hostname)
        local_networks = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128")
        if any(host in ipaddress.ip_network(network) for network in local_networks):
            return value.rstrip("/")
    raise ValueError("Home Assistant wymaga HTTPS lub prywatnego adresu LAN")


def numeric(value, lo, hi):
    if not isinstance(value, (int, float, str)) or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except ValueError:
        return None
    return result if lo <= result <= hi else None


def normalise(series, row, demand_sources):
    value, attrs = row["state"], row.get("attributes", {})
    result = [row["last_updated"], None]
    if series == "engo.demand":
        source = attrs.get("source")
        ms = numeric(attrs.get("event_ts_ms"), 0, 10**14)
        result[1] = value if value in ("off", "on") else None
        result.append(ms)
        result.append(source if source in demand_sources else None)
    elif series == "engo.climate":
        available = value not in ("unknown", "unavailable")
        result[1] = numeric(attrs.get("current_temperature"), -20, 60) if available else None
        result.append(numeric(attrs.get("temperature"), 0, 60) if available else None)
    elif series == "room.poll":
        if value not in ("unknown", "unavailable"):
            result[1] = utc(stamp(value))
    elif series.endswith(".mode"):
        if isinstance(value, str) and value not in ("unknown", "unavailable") and SAFE_WORD.fullmatch(value):
            result[1] = value
    else:
        limits = (0, 100) if series.endswith(".rh") else (-90, 100)
        result[1] = numeric(value, *limits)
        if series == "boiler.co":
            updated = attrs.get("updated_at")
            result.append(utc(stamp(updated)) if updated else None)
    stamp(result[0])
    return result


def capture_ha(base, token, start, stop, entities, demand_sources):
    if (not entities or not set(entities) <= HA_SERIES or len(set(entities.values())) != len(entities)
            or not all(re.fullmatch(r"[a-z_]+\.[a-z0-9_]+", entity) for entity in entities.values())):
        raise ValueError("Nieprawidłowe mapowanie encji archiwum")
    sql = request_json(base + "/api/services/sql/query?return_response", token, {"query": SQL_RUNS})
    runs = []
    for row in sql["service_response"]["result"]:
        start_at = utc(stamp(row["started"].replace(" ", "T") + "Z"))
        end_at = utc(stamp(row["ended"].replace(" ", "T") + "Z")) if row["ended"] else None
        if end_at is None or stamp(end_at) >= start:
            runs.append([row["run_id"], start_at, end_at, bool(row["closed_incorrect"])])
    if not runs or not any(stamp(run[1]) < stop for run in runs):
        raise ValueError("Brak sesji rejestratora dla końca eksportu")
    by_entity = {entity: series for series, entity in entities.items()}
    day = start
    by_series = defaultdict(list)
    while day < stop:
        end = min(day + 86400, stop)
        query = urlencode(dict(filter_entity_id=",".join(by_entity), end_time=utc(end),
                               significant_changes_only=0, skip_initial_state=1))
        data = request_json(f"{base}/api/history/period/{quote(utc(day))}?{query}", token)
        for rows in data:
            for row in rows:
                series = by_entity[row["entity_id"]]
                by_series[series].append(normalise(series, row, demand_sources))
        day = end
    return by_series, runs


def capture_weather(start, stop, coordinates):
    latitude = numeric(coordinates["latitude"], -90, 90)
    longitude = numeric(coordinates["longitude"], -180, 180)
    if latitude is None or longitude is None:
        raise ValueError("Nieprawidłowe współrzędne pogody")
    query = urlencode(dict(latitude=latitude, longitude=longitude, hourly="temperature_2m",
                           models="icon_eu", timezone="GMT", timeformat="unixtime",
                           start_date=utc(start)[:10], end_date=utc(stop)[:10]))
    result = request_json("https://historical-forecast-api.open-meteo.com/v1/forecast?" + query)
    hourly = result["hourly"]
    return [[utc(at), value] for at, value in zip(hourly["time"], hourly["temperature_2m"])
            if value is not None and start - 3600 < at < stop]


def capture_trv(path, start, stop):
    by_series = defaultdict(list)
    with path.open(encoding="utf-8") as stream:
        contents = stream.read()
    for line in contents.splitlines(keepends=True):
        # An existing poll may be in the middle of its final write.
        if not line.endswith("\n"):
            break
        item = json.loads(line)
        if item.get("version") != 1 or item.get("source") != "existing_cloud_poll":
            raise ValueError("Nieznany format pasywnego archiwum głowic")
        at = stamp(item["observed_at"])
        if not start <= at < stop:
            continue
        for head in HEAD_ROOMS:
            row = item["heads"][head]
            # The passive log does not include DPS 27, the correction used by HA.
            for field, key in (("temp", "temperature_c"), ("target", "target_temperature_c"),
                               ("mode", "3")):
                value = row.get(key)
                if field == "mode":
                    value = value if isinstance(value, str) and SAFE_WORD.fullmatch(value) else None
                else:
                    value = numeric(value, -40, 90)
                by_series[f"trv_poll.{head}.{field}"].append([utc(at), value])
    return by_series


def write_batch(root, data):
    target = root / DATA_PATH
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw = encode(data)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:20]
    filename = f"{utc(stamp(data['until']))[:10]}-{digest}.json"
    path = target / filename
    if not path.exists():
        temp = path.with_suffix(f".{os.getpid()}.tmp")
        temp.write_text(raw, encoding="utf-8")
        temp.replace(path)
    return path


def collect(root, start, stop, config):
    if not 0 < stop - start <= 15 * 86400:
        raise ValueError("Eksport obejmuje maksymalnie 15 dni")
    token = os.environ.get("HA_TOKEN") or keychain(config["ha_keychain_service"], config["ha_keychain_account"])
    by_series, runs = capture_ha(ha_base(config["ha_url"]), token, start, stop,
                                 config["entities"], config["demand_sources"])
    trv_log = config.get("trv_log")
    if not by_series.get("room.poll") and not by_series.get("engo.demand"):
        raise RuntimeError("Brak obserwacji źródłowych z Home Assistanta")
    if trv_log:
        try:
            by_series.update(capture_trv(Path(trv_log), start, stop))
        except OSError:
            print("Pasywny dziennik głowic niedostępny. Zachowano dane HA.", file=sys.stderr)
    try:
        by_series[WEATHER] = capture_weather(start, stop, config["weather"])
    except (OSError, ValueError, KeyError):
        print("Model pogody niedostępny. Zachowano dane lokalne.", file=sys.stderr)
    paths = []
    # Partition the initial backfill and the rolling export into blocks of at most one day.
    # Overlapping exports remain immutable and the report deduplicates exact events.
    day = start
    while day < stop:
        tomorrow = datetime.fromtimestamp(day, WARSAW).date() + timedelta(days=1)
        end = min(midnight(tomorrow.isoformat()), stop)
        events = {key: [row for row in rows if day <= stamp(row[0]) < end]
                  for key, rows in by_series.items()}
        day_runs = [run for run in runs if stamp(run[1]) < end
                    and (run[2] is None or stamp(run[2]) >= day)]
        path = write_batch(root, dict(version=1, since=utc(day), until=utc(end),
                           recorder_runs=day_runs, events={k: v for k, v in events.items() if v}))
        paths.append(path)
        day = end
    return paths, {key: max(rows, key=lambda row: stamp(row[0]))[0]
                   for key, rows in by_series.items() if rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", help="Początek w formacie RRRR-MM-DD, Europe/Warsaw")
    parser.add_argument("--until", help="Koniec UTC w ISO 8601")
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    stop = stamp(args.until) if args.until else int(datetime.now(UTC).timestamp()) - 120
    local_day = datetime.fromtimestamp(stop, WARSAW).date()
    start = midnight(args.start or (local_day - timedelta(days=2)).isoformat())
    paths, _ = collect(args.archive, start, stop, read_json(args.config))
    print(f"Zapisane partie: {len(paths)}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        # Errors from HTTP must not log a private URL or response body.
        details = f" HTTP {error.code}" if isinstance(error, HTTPError) else ""
        sys.exit(f"Eksport nieukończony: {type(error).__name__}{details}")
