"""Reconstruct daily, period and matched weather comparisons from the private archive."""

import argparse
import bisect
import itertools
import json
import math
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from heating_capture import DATA_PATH, HEAD_ROOMS, ROOMS, WARSAW, WEATHER, encode, midnight, read_json, stamp, utc

HDD_BASE = 21.5  # Same reference as public/insights.js.
WEATHER_BINS = (0, 5, 10, 15, 20)
CO_CONFIRMATIONS = "analityka/v1/potwierdzenia-co.json"
ROOM_NAMES = ("Sypialnia", "Salon", "Kuchnia", "Duża łazienka", "Mała łazienka", "Przedpokój")
HOUR = 3600


def union(windows):
    merged = []
    for a, b in sorted(windows):
        if a >= b:
            continue
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def clip(series, start, end):
    return [(max(a, start), min(b, end), value) for a, b, value in series
            if a < end and start < b]


def combine(left, right, fn):
    """Intersect two ordered, non-overlapping interval series."""
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        a, b, x = left[i]
        c, d, y = right[j]
        if max(a, c) < min(b, d):
            result.append((max(a, c), min(b, d), fn(x, y)))
        if b <= d:
            i += 1
        if d <= b:
            j += 1
    return result


def prefer(primary, secondary):
    """Use the second source only where the first has no coverage."""
    bounds = [a for a, _, _ in primary]
    result = list(primary)
    for a, b, value in secondary:
        i = max(0, bisect.bisect_right(bounds, a) - 1)
        while i < len(primary) and primary[i][0] < b:
            start, end, _ = primary[i]
            if a < start:
                result.append((a, start, value))
            a = max(a, end)
            i += 1
        if a < b:
            result.append((a, b, value))
    return sorted(result)


def squash(series):
    result = []
    for a, b, value in series:
        if result and result[-1][1] == a and result[-1][2] == value:
            result[-1] = (result[-1][0], b, value)
        else:
            result.append((a, b, value))
    return result


def span_rows(rows, start, end):
    i = bisect.bisect_left(rows, (start,))
    j = bisect.bisect_left(rows, (end,))
    return rows[i:j]


def steps(rows, windows, max_age=math.inf, demand=False):
    result = []
    for start, end, crash in windows:
        part = span_rows(rows, start, end)
        if not part:
            continue
        if crash:
            end = part[-1][0]
        changes = []
        last_gap = start
        for row in part:
            at, value = row[:2]
            if demand:
                event_ms = row[2]
                if value is None:
                    last_gap = at
                elif not (event_ms is not None and row[3] and last_gap <= event_ms / 1000 <= at + 2):
                    value = None
                # HA can expose the old binary value with the new event attributes
                # just before applying the value from that same source message.
                if (changes and value is not None and changes[-1][1] is not None
                        and event_ms == changes[-1][2] and row[3] == changes[-1][3]
                        and at - changes[-1][0] <= 1):
                    changes.pop()
            changes.append((at, value, *row[2:]))
        for i, (at, value, *_) in enumerate(changes):
            next_at = changes[i + 1][0] if i + 1 < len(changes) else end
            bound = min(next_at, at + max_age)
            if value is not None and at < bound:
                result.append((at, bound, value))
    return squash(result)


def intervals_for_runs(runs, downloads):
    windows = []
    for _, start, end, crash in sorted(runs.values(), key=lambda row: row[1]):
        for a, b in downloads:
            s, e = max(a, start), min(b, end)
            if s < e:
                windows.append((s, e, crash and e == end))
    return sorted(windows)


def gas_intervals(data):
    records = {}
    seen = {}
    for event in data["events"]:
        event_id = event["id"]
        if event_id in seen:
            if seen[event_id] != event:
                raise ValueError("Dwa różne zdarzenia gazowe mają ten sam identyfikator")
            continue
        seen[event_id] = event
        ident = event["record_id"]
        if event["op"] == "upsert":
            records[ident] = event["reading"]
        elif event["op"] == "delete":
            records.pop(ident, None)
        else:
            raise ValueError("Nieznana operacja rejestru gazu")
    at_times = defaultdict(set)
    for reading in records.values():
        at_times[(reading["meter"], stamp(reading["at"]))].add(reading["gas"])
    by_meter = defaultdict(list)
    for (meter, at), values in sorted(at_times.items()):
        by_meter[meter].append((at, next(iter(values)) if len(values) == 1 else None))
    for meter, readings in by_meter.items():
        for (a, old), (b, new) in zip(readings, readings[1:]):
            if a < b and old is not None and new is not None and 0 <= old <= new:
                yield a, b, new - old, meter


def apportion_exact(windows, start, end):
    """Return measured volume only for a contiguous chain with exact boundaries."""
    chains = defaultdict(dict)
    for a, b, volume, meter in windows:
        if start <= a and b <= end:
            chains[meter][a] = (b, volume)
    for meter, periods in chains.items():
        current, total = start, 0
        while current in periods:
            current, volume = periods[current]
            total += volume
        if current == end:
            return {"m3": round(total, 5), "meter": meter}
    return None


class Archive:
    def __init__(self, root, context=None):
        context = context or root
        self.rows = defaultdict(dict)
        self.areas = {}
        self.targets = {}
        self.gas = []
        self.runs = {}
        coverage = []
        declaration_rows = {}
        self.batch_windows = {}
        for path in sorted((root / DATA_PATH).glob("*.json")):
            data = read_json(path)
            if data["version"] != 1:
                raise ValueError("Nieobsługiwana wersja archiwum")
            start, end = stamp(data["since"]), stamp(data["until"])
            self.batch_windows[path.name] = (start, end)
            coverage.append((start, end))
            for run_id, a, b, crash in data["recorder_runs"]:
                key = (run_id, a)
                old = self.runs.get(key)
                run = (run_id, stamp(a), stamp(b) if b else math.inf, crash)
                if old is None or run[2] < old[2]:
                    self.runs[key] = run
            for series, rows in data["events"].items():
                for event_at, value, *meta in rows:
                    at = stamp(event_at)
                    record = (value, *meta)
                    old = self.rows[series].setdefault(at, record)
                    if old != record:
                        # Revised weather forecasts and conflicting HA reads are retained
                        # in the batches. A disputed timestamp is excluded from calculations.
                        self.rows[series][at] = (None, *((None,) * len(meta)))
                    if series == "boiler.co" and value is not None and meta[0]:
                        declared = stamp(meta[0])
                        if declaration_rows.setdefault(declared, value) != value:
                            declaration_rows[declared] = None
        if not coverage:
            raise ValueError("Brak partii archiwum")
        self.coverage = union(coverage)
        self.until = self.coverage[-1][1]
        self.windows = intervals_for_runs(self.runs, self.coverage)
        self.rows["boiler.declarations"] = {a: (v,) for a, v in declaration_rows.items()}
        card = context / "karta/karta-instalacji.json"
        if card.is_file():
            self.areas = {r["id"]: r["area_m2"] for r in read_json(card)["apartment"]["rooms"]}
        for snapshot in sorted((context / "snapshot").glob("raport-HA-i-dziennik-*.json")):
            saved = read_json(snapshot)
            targets = saved.get("settings_at_export", {}).get("room_targets_c")
            if targets:
                self.targets = targets
                self.targets_at = saved["created_at"]
                break
        gas = context / "sync/gazomierz-v1.json"
        if gas.is_file():
            self.gas = sorted(gas_intervals(read_json(gas)))
        self.co_confirmed = []
        confirmations = context / CO_CONFIRMATIONS
        if confirmations.is_file():
            saved = read_json(confirmations)
            if saved["version"] != 1:
                raise ValueError("Nieobsługiwana wersja potwierdzeń nastawy CO")
            for row in saved["confirmations"]:
                start, confirmed = stamp(row["valid_from"]), stamp(row["confirmed_at"])
                value = row["value_c"]
                if (not start < confirmed or type(value) not in (int, float)
                        or not 0 < value <= 100 or row["source"] != "owner_confirmation"):
                    raise ValueError("Nieprawidłowe potwierdzenie nastawy CO")
                self.co_confirmed.append((start, confirmed, (value, row["source"], row["confirmed_at"])))
            self.co_confirmed.sort()
            if any(a[1] > b[0] for a, b in zip(self.co_confirmed, self.co_confirmed[1:])):
                raise ValueError("Nakładające się potwierdzenia nastawy CO")
        targets = root / "analityka/v1/cele-pokojowe.json"
        self.room_targets = defaultdict(list)
        if targets.is_file():
            for item in read_json(targets):
                a, b = stamp(item["start"]), stamp(item["end"])
                room = item["room"]
                value = item["target_c"]
                if room not in ROOMS or not a < b or not math.isfinite(value) or not item["source"]:
                    raise ValueError("Nieprawidłowy przedział celu pokojowego")
                self.room_targets[room].append((a, b, value))
            for series in self.room_targets.values():
                series.sort()
                if any(a[1] > b[0] for a, b in zip(series, series[1:])):
                    raise ValueError("Nakładające się przedziały celów pokojowych")
        self.series = self.build_series()

    def events(self, key):
        return sorted((at, *row) for at, row in self.rows[key].items())

    def build_series(self):
        clean = {}
        clean["engo.demand"] = steps(self.events("engo.demand"), self.windows, demand=True)
        climate = self.events("engo.climate")
        for field, index in (("temp", 1), ("target", 2)):
            key = "engo." + field
            clean[key] = prefer(steps([(row[0], row[index]) for row in climate], self.windows),
                                steps(self.events(key), self.windows))
        # Entries are durable records of manual declarations, with their own creation timestamp.
        clean["boiler.co"] = steps(self.events("boiler.declarations"),
                                   [(0, self.until, False)])
        polls = [(at, value) for at, value in self.events("room.poll")
                 if value is None or 0 <= at - stamp(value) <= 120]
        fresh = steps(polls, self.windows, max_age=25 * 60)
        for room in ROOMS:
            for field in ("temp", "rh"):
                key = f"room.{room}.{field}"
                mqtt = steps(self.events(key), self.windows)
                rest = steps(self.events(f"room_rest.{room}.{field}"), self.windows)
                clean[key] = combine(prefer(mqtt, rest), fresh, lambda value, _: value)
        for head in HEAD_ROOMS:
            for field in ("temp", "target", "mode", "offset"):
                key = f"trv.{head}.{field}"
                ha = steps(self.events(key), self.windows)
                passive = steps(self.events(f"trv_poll.{head}.{field}"),
                                [(a, b, False) for a, b in self.coverage], max_age=25 * 60)
                clean[key] = prefer(passive, ha)
        # Only whole-hour model samples may contribute beyond their own timestamp.
        clean[WEATHER] = [(at, min(at + HOUR, self.until), value)
                          for at, value in self.events(WEATHER) if value is not None and at < self.until]
        clean["outdoor.met_no"] = steps(self.events("outdoor.met_no"), self.windows, max_age=2 * HOUR)
        return clean


def seconds(series):
    return sum(b - a for a, b, _ in series)


def statistics(series, duration):
    covered = seconds(series)
    values = [value for _, _, value in series]
    return {
        "covered_s": covered,
        "missing_s": duration - covered,
        "last_covered_until": utc(series[-1][1]) if series else None,
        "mean": sum((b - a) * value for a, b, value in series) / covered if covered else None,
        "min": min(values, default=None),
        "max": max(values, default=None),
    }


def demand_statistics(series, start, end):
    by_status = {}
    observed = clip(series, start, end)
    coverage = seconds(observed)
    # A full ON or OFF interval must be bracketed by contiguous opposite states.
    for status in ("on", "off"):
        intervals = [(a, b) for (pa, pb, p), (a, b, value), (na, nb, n)
                     in zip(series, series[1:], series[2:])
                     if value == status and p != status and n != status
                     and pb == a and na == b and start <= a < b <= end]
        active = seconds([row for row in observed if row[2] == status])
        by_status[status] = {"seconds": active, "share": active / coverage if coverage else None,
                             "complete_intervals": len(intervals),
                             "mean_complete_s": sum(b - a for a, b in intervals) / len(intervals)
                             if intervals else None}
    gaps = []
    last = start
    for a, b, _ in observed:
        if last < a:
            gaps.append([utc(last), utc(a)])
        last = b
    if last < end:
        gaps.append([utc(last), utc(end)])
    return {"observed_s": coverage, "missing_s": end - start - coverage, "gaps": gaps, **by_status}


def timeline(series, start, end):
    return [{"start": utc(a), "end": utc(b), "seconds": b - a, "value": value}
            for a, b, value in squash(clip(series, start, end))]


def boiler_timeline(archive, start, end):
    recorded = [(a, b, (value, "home_assistant_declaration", utc(a)))
                for a, b, value in archive.series["boiler.co"]]
    series = prefer(recorded, archive.co_confirmed)
    return [{"start": utc(a), "end": utc(b), "seconds": b - a, "value": value,
             "source": source, "recorded_at": recorded_at}
            for a, b, (value, source, recorded_at) in clip(series, start, end)]


def weather(series, start, end, hourly=False):
    values = clip(series, start, end)
    stats = statistics(values, end - start)
    coverage = stats["covered_s"]
    histogram = [0.0] * (len(WEATHER_BINS) + 1)
    for a, b, value in values:
        histogram[bisect.bisect_right(WEATHER_BINS, value)] += b - a
    stats["bins"] = [n / coverage for n in histogram] if coverage else None
    stats["hdd_21_5"] = (sum((b - a) * max(0, HDD_BASE - value) for a, b, value in values)
                         / 86400 if coverage else None)
    if hourly:
        stats["hours"] = [{"start": utc(a), "end": utc(b), "value": value} for a, b, value in values]
    return stats


def gas_row(window, series):
    start, end, volume, meter = window
    w = weather(series, start, end)
    degree_days = w["hdd_21_5"]
    full_weather = w["missing_s"] < 1
    return {"start": utc(start), "end": utc(end), "seconds": end - start, "m3": round(volume, 5),
            "meter": meter, "m3_24h": volume * 86400 / (end - start),
            "m3_per_hdd": volume / degree_days if full_weather and degree_days else None,
            "weather": w}


def apartment_series(rooms, weights):
    if set(weights) != set(rooms) or any(value <= 0 for value in weights.values()):
        return []
    combined = None
    total = sum(weights.values())
    for room, series in rooms.items():
        weighted = [(a, b, value * weights[room] / total) for a, b, value in series]
        combined = weighted if combined is None else combine(combined, weighted, lambda x, y: x + y)
    return combined or []


def period(archive, start, end):
    series = archive.series
    duration = end - start
    indoor = {room: clip(series[f"room.{room}.temp"], start, end) for room in ROOMS}
    rooms = {}
    for room, temp in indoor.items():
        compared = combine(temp, archive.room_targets[room], lambda value, target: value < target)
        reference = archive.targets.get(room)
        rooms[room] = {
            "temperature": statistics(temp, duration),
            "humidity": statistics(clip(series[f"room.{room}.rh"], start, end), duration),
            "target": timeline(archive.room_targets[room], start, end),
            "target_compare_s": seconds(compared),
            "below_confirmed_target_s": seconds([row for row in compared if row[2]]) if compared else None,
            "reference_target_c": reference,
            "below_reference_s": seconds([row for row in temp if row[2] < reference])
            if reference is not None and temp else None,
        }
    heads = {}
    for head, room in HEAD_ROOMS.items():
        head_series = {field: series[f"trv.{head}.{field}"] for field in ("temp", "target", "offset", "mode")}
        heads[head] = {"room": room, "temperature": statistics(clip(head_series["temp"], start, end), duration)}
        for field in ("target", "offset", "mode"):
            times = timeline(head_series[field], start, end)
            heads[head][field] = {"intervals": times, "covered_s": seconds(clip(head_series[field], start, end))}
    return {"start": utc(start), "end": utc(end), "seconds": duration,
            "weather": weather(series[WEATHER], start, end, hourly=True),
            "met_no_model": weather(series["outdoor.met_no"], start, end),
            "engo": demand_statistics(series["engo.demand"], start, end),
            "engo_temperature": statistics(clip(series["engo.temp"], start, end), duration),
            "engo_target": timeline(series["engo.target"], start, end),
            "boiler_co_declared": boiler_timeline(archive, start, end),
            "boiler_dhw_verified": None,
            "rooms": rooms, "heads": heads,
            "apartment_equal": statistics(apartment_series(indoor, dict.fromkeys(ROOMS, 1)), duration),
            "apartment_area_weighted": statistics(apartment_series(indoor, archive.areas), duration),
            "gas_at_exact_boundaries": apportion_exact(archive.gas, start, end)}


def compare(rows, against=None):
    """Find weather matches with explicit tolerances; observations do not imply causality."""
    pairs = []
    candidates = itertools.combinations(rows, 2) if against is None else ((against, row) for row in rows)
    for left, right in candidates:
        if left["end"] > right["start"] and right["end"] > left["start"]:
            continue
        a, b = left["weather"], right["weather"]
        if (abs(left["seconds"] / right["seconds"] - 1) > 0.10
                or min(a["covered_s"] / left["seconds"], b["covered_s"] / right["seconds"]) < 0.90):
            continue
        mean_delta = abs(a["mean"] - b["mean"])
        distribution_delta = sum(abs(x - y) for x, y in zip(a["bins"], b["bins"])) / 2
        if mean_delta > 2 or distribution_delta > 0.30:
            continue
        quality = min(
            block["engo"]["observed_s"] / block["seconds"] for block in (left, right)
        )
        pairs.append({"left": left["start"], "right": right["start"], "mean_difference_c": mean_delta,
                      "temperature_distribution_distance": distribution_delta, "engo_coverage_min": quality,
                      "left_room_coverage_min": min(r["temperature"]["covered_s"] / left["seconds"]
                                                    for r in left["rooms"].values()),
                      "right_room_coverage_min": min(r["temperature"]["covered_s"] / right["seconds"]
                                                     for r in right["rooms"].values()),
                      "left_co": left["boiler_co_declared"], "right_co": right["boiler_co_declared"],
                      "left_engo_on_share": left["engo"]["on"]["share"],
                      "right_engo_on_share": right["engo"]["on"]["share"],
                      "left_room_means": {room: r["temperature"]["mean"] for room, r in left["rooms"].items()},
                      "right_room_means": {room: r["temperature"]["mean"] for room, r in right["rooms"].items()},
                      "left_gas": left["gas_at_exact_boundaries"], "right_gas": right["gas_at_exact_boundaries"],
                      "result": "nierozstrzygnięty"})
    return sorted(pairs, key=lambda row: (row["mean_difference_c"], row["temperature_distribution_distance"]))


def local(value, full=False):
    return datetime.fromtimestamp(stamp(value), WARSAW).strftime("%Y-%m-%d %H:%M" if full else "%H:%M")


def num(value, precision=1):
    return "—" if value is None else f"{value:.{precision}f}".replace(".", ",")


def hours(value):
    if value is None:
        return "—"
    if 0 < value < 60:
        return "<1 min"
    h, m = divmod(round(value / 60), 60)
    return f"{h} h {m:02d} min"


def format_settings(values):
    labels = []
    for row in values:
        start, end = local(row["start"]), local(row["end"])
        if end == "00:00":
            end = "24:00"
        if start == end:
            start, end = (datetime.fromtimestamp(stamp(row[key]), WARSAW).strftime("%H:%M:%S")
                          for key in ("start", "end"))
        source = {"owner_confirmation": " · potwierdzenie właściciela",
                  "home_assistant_declaration": " · deklaracja w HA"}.get(row.get("source"), "")
        labels.append(f"{num(row['value'])}°C ({start}–{end}{source})")
    return "; ".join(labels) or "—"


def markdown(report):
    lines = ["# Porównanie ogrzewania", "",
             f"Okres od {local(report['period']['start'], True)} do {local(report['period']['end'], True)} "
             "w strefie Europe/Warsaw. Źródła i pokrycie opisano poniżej.", "",
             "| Dzień | Model na zewnątrz śr. [min–maks.] °C | Pokrycie pogody | Stopniodni | ENGO ON | ENGO OFF | Bez danych ENGO | Pełne odcinki ON/OFF | CO zadeklarowane | ENGO zadane | Gaz w granicach doby |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|"]
    for day in report["days"]:
        w, e = day["weather"], day["engo"]
        full = day["end"] == utc(midnight((date.fromisoformat(day["date"]) + timedelta(days=1)).isoformat()))
        exact_gas = day["gas_at_exact_boundaries"]
        lines.append(f"| {day['date']}{'' if full else ' (część)'} | {num(w['mean'])} "
                     f"[{num(w['min'])}–{num(w['max'])}] | {num(100 * w['covered_s'] / day['seconds'], 0)}% | {num(w['hdd_21_5'], 2)} | "
                     f"{hours(e['on']['seconds']) if e['observed_s'] else '—'} | "
                     f"{hours(e['off']['seconds']) if e['observed_s'] else '—'} | {hours(e['missing_s'])} | "
                     f"{e['on']['complete_intervals']}/{e['off']['complete_intervals']} | "
                     f"{format_settings(day['boiler_co_declared'])} | {format_settings(day['engo_target'])} | "
                     f"{num(exact_gas['m3'], 3) + ' m³' if exact_gas else '—'} |")
    lines.extend(["", "## Pomiary w pokojach", "",
                  "W każdej komórce średnia temperatura w °C, średnia wilgotność w % i pokrycie obserwacji temperatury. Średnia mieszkania obejmuje wspólne przedziały pomiarów wszystkich sześciu pokoi.", "",
                  "| Dzień | " + " | ".join(ROOM_NAMES) + " | Mieszkanie równa / ważona |",
                  "|---|" + "---:|" * 7])
    for day in report["days"]:
        values = [f"{num(r['temperature']['mean'])} / {num(r['humidity']['mean'], 0)} / "
                  f"{num(100 * r['temperature']['covered_s'] / day['seconds'], 0)}%"
                  for r in day["rooms"].values()]
        lines.append("| " + " | ".join([day["date"], *values,
                     f"{num(day['apartment_equal']['mean'])} / {num(day['apartment_area_weighted']['mean'])}"]) + " |")
    lines.extend(["", "## Gaz między rzeczywistymi odczytami", "",
                  "Gaz obejmuje CO i CWU. Pokazano całe przedziały, które przecinają okres raportu.", "",
                  "| Początek | Koniec | Długość | m³ | m³/24 h | Pogoda °C | m³/stopniodzień |",
                  "|---|---|---:|---:|---:|---:|---:|"])
    for row in report["gas_intervals"]:
        lines.append(f"| {local(row['start'], True)} | {local(row['end'], True)} | {hours(row['seconds'])} | "
                     f"{num(row['m3'], 3)} | {num(row['m3_24h'], 3)} | {num(row['weather']['mean'])} | "
                     f"{num(row['m3_per_hdd'], 3)} |")
    whole = report["period"]
    lines.extend(["", "## Pokrycie głowic", "",
                  "| Głowica | Temperatura | Nastawa | Korekta | Tryb |",
                  "|---|---:|---:|---:|---:|"])
    for head, row in whole["heads"].items():
        coverage = [row[field]["covered_s"] for field in ("temperature", "target", "offset", "mode")]
        lines.append("| " + " | ".join([head, *(f"{num(100 * x / whole['seconds'], 0)}%" for x in coverage)]) + " |")
    lines.extend(["", "## Cele pokojowe i komfort", "",
                  "| Pokój | Czas z potwierdzonym progiem | Czas poniżej potwierdzonego progu | Próg odniesienia | Czas poniżej odniesienia |",
                  "|---|---:|---:|---:|---:|"])
    for name, row in zip(ROOM_NAMES, whole["rooms"].values()):
        lines.append(f"| {name} | {hours(row['target_compare_s'])} | "
                     f"{hours(row['below_confirmed_target_s'])} | {num(row['reference_target_c'])} | "
                     f"{hours(row['below_reference_s'])} |")
    lines.extend(["", "## Jakość porównania", "",
                  "- Pogoda to godzinowy model Open-Meteo ICON-EU. Stopniodni to suma nadwyżek bazy 21,5°C nad temperaturą na zewnątrz za obserwowane godziny, podzielona przez 24.",
                  "- ON to żądanie ciepła ENGO. Czas po restarcie przed wiarygodnym odczytem wchodzi do braków. Pełne odcinki ON i OFF muszą mieć oba przełączenia w obserwacji.",
                  "- Historia nastawy CO rozróżnia potwierdzenie właściciela i deklarację zapisaną w HA. Zmiana źródła przy tej samej wartości nie jest zmianą nastawy. Brakuje potwierdzonej historii temperatury wody, nastawy CWU i pracy palnika.",
                  "- Szczegółowy raport JSON zawiera przerwy, udział ON/OFF, średnie długości pełnych odcinków, historię każdej głowicy, temperaturę mierzoną przez ENGO i pokrycie każdej serii.",
                  "- Cele z migawki są odniesieniem do opisu komfortu. Potwierdzone czasy obowiązywania celów są ujęte osobno.",
                  f"- Liczba par dni o podobnej pogodzie spełniających przyjęte kryteria wynosi {len(report['matched_days'])}. Ocena wpływu nastaw wymaga też udokumentowanego komfortu, zmian, porównywalnych okien gazu i uwzględnienia CWU.", ""])
    return "\n".join(lines)


def report(archive, start_day, end_day, against=None, as_of=None):
    start = midnight(start_day)
    stop = min(midnight(end_day), as_of if as_of is not None else archive.until, archive.until)
    if start >= stop:
        raise ValueError("Okres jest pusty lub wykracza poza ostatni eksport")
    day = date.fromisoformat(start_day)
    days = []
    while midnight(day.isoformat()) < stop:
        tomorrow = day + timedelta(days=1)
        days.append({"date": day.isoformat(), **period(archive, midnight(day.isoformat()),
                                                       min(stop, midnight(tomorrow.isoformat())))})
        day = tomorrow
    weekly = period(archive, start, stop)
    result = {
        "version": 1, "period": weekly, "days": days, "matched_days": compare(days),
        "archive_end": utc(archive.until), "comfort_reference_at": getattr(archive, "targets_at", None),
        "source_batches": [name for name, (a, _) in archive.batch_windows.items()
                           if a < stop or (against and a < midnight(against[1]))],
        "gas_intervals": [gas_row(w, archive.series[WEATHER]) for w in archive.gas
                          if w[0] < stop and start < w[1] <= (as_of if as_of is not None else archive.until)],
    }
    if against:
        a, b = map(midnight, against)
        if not a < b <= archive.until:
            raise ValueError("Porównywany okres musi się kończyć przed ostatnią granicą eksportu")
        other = period(archive, a, b)
        result["comparison_period"] = other
        result["matched_periods"] = compare([other], against=weekly)
        result["matched_gas"] = compare_gas(archive, (start, stop), (a, b))
    return result


def compare_gas(archive, left, right):
    matches = []
    left_windows = [x for x in archive.gas if left[0] <= x[0] and x[1] <= left[1]]
    right_windows = [x for x in archive.gas if right[0] <= x[0] and x[1] <= right[1]]
    for a, b in itertools.product(left_windows, right_windows):
        if a[3] != b[3]:
            continue
        first, second = gas_row(a, archive.series[WEATHER]), gas_row(b, archive.series[WEATHER])
        w, v = first["weather"], second["weather"]
        if w["missing_s"] > 1 or v["missing_s"] > 1 or abs(first["seconds"] / second["seconds"] - 1) > 0.10:
            continue
        if abs(w["mean"] - v["mean"]) > 2 or sum(abs(x-y) for x, y in zip(w["bins"], v["bins"])) / 2 > 0.30:
            continue
        for window, row in ((a, first), (b, second)):
            block = period(archive, window[0], window[1])
            row["boiler_co_declared"] = block["boiler_co_declared"]
            row["engo_on_share"] = block["engo"]["on"]["share"]
            row["engo_coverage"] = block["engo"]["observed_s"] / block["seconds"]
            row["comfort"] = {room: {
                "mean_c": room_data["temperature"]["mean"],
                "coverage": room_data["temperature"]["covered_s"] / block["seconds"],
                "target_coverage": room_data["target_compare_s"] / block["seconds"],
                "below_confirmed_target_s": room_data["below_confirmed_target_s"],
            } for room, room_data in block["rooms"].items()}
        matches.append({"left": first, "right": second, "result": "nierozstrzygnięty"})
    return matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--context-archive", type=Path, help="Osobny checkout aktualnej gałęzi ze źródłowym dziennikiem gazu i kartą")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True, help="Pierwsza data poza okresem")
    parser.add_argument("--against", nargs=2, metavar=("START", "END"))
    parser.add_argument("--as-of", help="Odtwórz raport do tej daty i godziny ISO 8601")
    parser.add_argument("--output", type=Path, required=True, help="Prywatny katalog wyjściowy")
    args = parser.parse_args()
    os.umask(0o077)
    data = report(Archive(args.archive, args.context_archive), args.start, args.end, args.against,
                  stamp(args.as_of) if args.as_of else None)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "raport.json").write_text(encode(data), encoding="utf-8")
    (args.output / "raport.md").write_text(markdown(data), encoding="utf-8")


if __name__ == "__main__":
    main()
