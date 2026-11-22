"""Compare bathroom observations from the existing private archive."""

import argparse
import bisect
import math
from datetime import date, datetime, timedelta
from pathlib import Path

from heating_capture import BATH_SERIES, WARSAW, WEATHER, encode, midnight, read_json, stamp, utc
from heating_report import Archive, clip, combine, seconds, statistics, steps


def at(series, moment):
    i = bisect.bisect_right(series, (moment, math.inf)) - 1
    if i >= 0 and series[i][0] <= moment < series[i][1]:
        return series[i][2]
    return None


def paired_relay_events(data):
    """Only form intervals between successive observed ON and OFF edges."""
    if data["version"] != 1 or data["source"] != "app_log_excerpt":
        raise ValueError("Unknown observation format")
    edges = {}
    for row in data["relay_events"]:
        moment = stamp(row["at"])
        state = row["state"]
        if state not in ("on", "off"):
            raise ValueError("Unexpected relay state")
        if edges.setdefault(moment, state) != state:
            edges[moment] = None
    ordered = sorted(edges.items())
    return [(a, b, "on") for (a, x), (b, y) in zip(ordered, ordered[1:])
            if x == "on" and y == "off"]


def electrical_delta(rows, windows, start, end, daily=False):
    """Only add adjacent valid meter differences observed within the same continuity window."""
    differences = []
    resets = 0
    for a, b, _ in windows:
        kept = [(t, val) for t, val in rows if max(a, start) <= t < min(b, end)]
        for (left, x), (right, y) in zip(kept, kept[1:]):
            same_day = datetime.fromtimestamp(left, WARSAW).date() == datetime.fromtimestamp(right, WARSAW).date()
            if x is None or y is None or left >= right or (daily and not same_day):
                continue
            if y < x:
                resets += 1
                continue
            differences.append((left, right, y - x))
    return {"kwh": sum(v for _, _, v in differences) if differences else None,
            "observed_s": seconds(differences), "resets": resets}


def latest_daily_readings(rows):
    result = {}
    for t, val in sorted(rows):
        if val is not None:
            result[datetime.fromtimestamp(t, WARSAW).date().isoformat()] = {"at": utc(t), "kwh": val}
    return result


def air_water(temp, rh):
    """Magnus estimate for vapour over water. Inputs are coincident room readings."""
    if temp is None or rh is None or not -30 <= temp <= 60 or not 0 < rh <= 100:
        return {"abs_g_m3": None, "dew_c": None}
    gamma = math.log(rh / 100) + 17.62 * temp / (243.12 + temp)
    vapor_hpa = 6.112 * math.exp(gamma)
    return {"abs_g_m3": 216.7 * vapor_hpa / (temp + 273.15),
            "dew_c": 243.12 * gamma / (17.62 - gamma)}


def point(room_temp, room_rh, time):
    temp, rh = at(room_temp, time), at(room_rh, time)
    return {"temp_c": temp, "rh_pct": rh, **air_water(temp, rh)}


def humidity_crossings(seq, threshold):
    return [(b, "up" if y > threshold else "down")
            for (_, end, x), (b, _, y) in zip(seq, seq[1:])
            if b == end and (x > threshold) != (y > threshold)]


def balance_class(engo, convector, relay):
    if engo == "on":
        return "A" if (convector, relay) == ("off", "off") else "D"
    return {("on", "off"): "B", ("off", "on"): "C", ("off", "off"): "E"}.get((convector, relay), "other")


def classify(engo, convector, relay):
    """Intersect only known states. Gaps remain outside the classified output."""
    pair = combine(convector, relay, lambda c, r: (c, r))
    return combine(engo, pair, lambda e, cr: balance_class(e, *cr))


def state_times(seq, a, b):
    clipped = clip(seq, a, b)
    on = seconds([(s, e, v) for s, e, v in clipped if v == "on"])
    off = seconds([(s, e, v) for s, e, v in clipped if v == "off"])
    return {"on_s": on, "off_s": off, "unknown_s": b - a - on - off}


def analyze(archive, observations, start_day, stop_day):
    start, end = midnight(start_day), min(midnight(stop_day), archive.until)
    if start >= end:
        raise ValueError("No data in selected interval")
    series = archive.series
    temp = series["room.smallbath.temp"]
    rh = series["room.smallbath.rh"]
    weather = series[WEATHER]
    engo = series["engo.demand"]
    g1 = combine(series["trv.G1.temp"], series["trv.G1.target"], lambda t, s: t < s)
    manual_relay = clip(paired_relay_events(observations), start, end)
    aux = {key: steps(archive.events(key), archive.windows) for key in BATH_SERIES}
    for key, seq in aux.items():
        if not key.endswith(".available"):
            availability = key.rsplit(".", 1)[0] + ".available"
            if archive.events(availability):
                aux[key] = [(a, b, val) for a, b, (val, ok) in combine(seq, aux[availability], lambda x, y: (x, y))
                            if ok == "on"]
    convector = aux["bath.convector.enabled"]
    relay = aux["bath.dehumidifier.relay"]
    days = []
    day = date.fromisoformat(start_day)
    while midnight(day.isoformat()) < end:
        def hour(h, m):
            return datetime(day.year, day.month, day.day, h, m, tzinfo=WARSAW).timestamp()
        a, b = hour(4, 45), hour(5, 45)
        if b <= end:
            marks = (a, hour(5, 15), b, hour(6, 15), hour(6, 45))
            points = [point(temp, rh, t) if t <= end else point([], [], t) for t in marks]
            days.append({"date": str(day), "room": points, "weather": statistics(clip(weather, a, b), b-a),
                         "engo": state_times(engo, a, b), "convector": state_times(convector, a, b),
                         "convector_element": state_times(aux["bath.convector.element"], a, b),
                         "convector_modes": sorted({v for _, _, v in clip(aux["bath.convector.mode"], a, b)}),
                         "plug_ha": state_times(relay, a, b),
                         "plug_log_on_s": seconds(clip(manual_relay, a, b)),
                         "humidity_trigger_candidates": [utc(t) for t, direction in humidity_crossings(rh, 70)
                                                         if a-1800 < t < b and direction == "up"]})
        day += timedelta(days=1)
    relay_windows = []
    for a, b, _ in manual_relay:
        relay_windows.append({"start": utc(a), "end": utc(b), "s": b-a,
                              "start_room": point(temp,rh,a), "end_room": point(temp,rh,b),
                              "after_room": point(temp,rh,b+1800) if b+1800<=end else point([], [], b+1800),
                              "engo": state_times(engo,a,b)})
    classes = clip(classify(engo, convector, relay), start, end)
    balance = {}
    for label in ("A", "B", "C", "D", "E", "other"):
        spans = [(a, b, v) for a, b, v in classes if v == label]
        span_time = seconds(spans)
        balance[label] = {
            "s": span_time,
            "temperature": statistics(combine(temp, spans, lambda t, _: t), span_time),
            "humidity": statistics(combine(rh, spans, lambda h, _: h), span_time),
            "weather": statistics(combine(weather, spans, lambda t, _: t), span_time),
        }
    meters = {}
    for dev in ("convector", "dehumidifier"):
        total_key = f"bath.{dev}.energy_total_kwh"
        daily_key = f"bath.{dev}.energy_day_kwh"
        daily = [(t, value) for t, value in archive.events(daily_key) if start <= t < end]
        available_runs = archive.windows
        if archive.events(f"bath.{dev}.available"):
            windows = [(a, b, False) for a, b, state in aux[f"bath.{dev}.available"] if state == "on"]
            recorder = [(a, b, crash) for a, b, crash in available_runs]
            # Retain continuity boundaries even when the availability state does not change.
            available_runs = [(max(a, c), min(b, d), crash) for a, b, crash in recorder
                              for c, d, _ in windows if max(a, c) < min(b, d)]
        meters[dev] = {
            "total_measured_delta": electrical_delta(archive.events(total_key), available_runs, start, end),
            "latest_daily_readings": latest_daily_readings(daily),
        }
    return {"start": utc(start), "end": utc(end), "days": days, "relay_windows": relay_windows,
            "engo": state_times(engo,start,end), "room": statistics(clip(temp,start,end),end-start),
            "humidity": statistics(clip(rh,start,end),end-start),
            "g1_below_s": seconds([(a,b,v) for a,b,v in clip(g1,start,end) if v]),
            "g1_observed_s": seconds(clip(g1,start,end)),
            "electrical_history_s": {k:seconds(clip(v,start,end)) for k,v in aux.items()},
            "ha_energy": meters,
            "manual_daily_energy": observations.get("daily_energy", []),
            "balance": balance,
            "balance_unknown_s": end-start-seconds(classes)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--observations", required=True, type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True, help="Exclusive local calendar date")
    opt = parser.parse_args()
    result = analyze(Archive(opt.archive), read_json(opt.observations), opt.start, opt.end)
    print(encode(result), end="")


if __name__ == "__main__":
    main()
