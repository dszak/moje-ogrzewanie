"""Read-only decoding of SETTI+ TRV001 Tuya DPS data.

This module never logs in, sends commands, publishes data or reads credentials.
It is intended for an existing authenticated SETTI+ bridge, which can pass its
already-fetched `devices` dictionary to `make_snapshot()`.

DPS 119 is a 24-byte Base64 daily history of the valve motor opening indicator.
The relationship between indices and actual hours/time zones is NOT verified.
Do not interpret the last entry as the live valve position or ENGO/boiler state.
"""

from __future__ import annotations

import base64
import binascii
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re

HEADS = tuple(range(1, 9))
STATUS_FIELDS = {
    "3": "work_state_raw",
    "8": "window_raw",
    "10": "antifreeze_raw",
    "40": "child_lock_raw",
    "101": "switch_raw",
    "104": "heating_time_raw",
    "105": "battery_alarm_raw",
    "106": "away_raw",
    "108": "programming_switch_raw",
    "130": "water_scale_proof_raw",
}
BOOL_DPS = frozenset(("8", "10", "40", "101", "106", "108", "130"))
INT_DPS = frozenset(("104", "105"))


def decode_dps119(raw: str) -> list[int]:
    """Decode 24 index-ordered values (0..100) without assigning timestamps.

    Only the format and range are verified, not the hourly meaning.
    """
    if not isinstance(raw, str) or len(raw) != 32:
        raise ValueError("DPS 119: oczekiwano 32 znakow Base64")
    try:
        decoded = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("DPS 119: nieprawidlowy Base64") from exc
    if len(decoded) != 24 or base64.b64encode(decoded).decode("ascii") != raw:
        raise ValueError("DPS 119: niekanoniczny zapis lub nieprawidlowy rozmiar")
    values = list(decoded)
    if any(value > 100 for value in values):
        raise ValueError("DPS 119: wartosc poza zakresem 0..100")
    return values


def _status(dps: dict) -> dict:
    """Whitelist-only scalars; unknown/incorrect values are not interpreted."""
    result = {}
    for key, name in STATUS_FIELDS.items():
        value = dps.get(key)
        if key in BOOL_DPS and type(value) is bool:
            result[name] = value
        elif key in INT_DPS and type(value) is int and -100000 <= value <= 100000:
            result[name] = value
        elif key == "3" and isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,40}", value):
            result[name] = value
    return result


def make_snapshot(devices: dict, observed_at: datetime | None = None) -> dict:
    """Sanitize existing Tuya API data into a private, read-only snapshot.

    Important: `devices` must be obtained by the already-running bridge.
    No keys, IDs, user names, credentials, schedules or raw DPS strings escape.
    """
    if not isinstance(devices, dict):
        raise ValueError("Nieprawidlowy zestaw urzadzen")
    timestamp = observed_at or datetime.now(timezone.utc)
    if not isinstance(timestamp, datetime) or timestamp.tzinfo is None:
        raise ValueError("Brak strefy czasowej")
    heads = {}
    for n in HEADS:
        matches = [dev for name, dev in devices.items()
                   if isinstance(name, str) and isinstance(dev, dict)
                   and dev.get("category") == "wk"
                   and re.match(r"^TRV%d(?:\s|$)" % n, name.strip(), re.IGNORECASE)]
        if len(matches) != 1:
            raise ValueError("G%d: wymagano jednej glowicy" % n)
        dps = matches[0].get("dps")
        if not isinstance(dps, dict):
            raise ValueError("G%d: nieprawidlowe DPS" % n)
        # Missing or malformed history never becomes 'zero' (closed valve).
        history = decode_dps119(dps["119"]) if "119" in dps else None
        heads["g%d" % n] = {
            "dps119_day_indexed_percent": history,
            "status_raw": _status(dps),
        }
    return {
        "schema_version": 1,
        "source": "setti-trv001-tuya-dps",
        "observed_at_utc": timestamp.astimezone(timezone.utc).isoformat(timespec="seconds"),
        "history_index_time_mapping": "unverified",
        "history_indicator_meaning": "valve-motor-opening-history-unverified-scale",
        "heads": heads,
    }


def append_private_jsonl(devices: dict, path: Path, observed_at: datetime | None = None) -> None:
    """Append only sanitized snapshots to an existing private local directory.

    Does not create parent directories. On a regular file, requests mode 0600.
    Do not pass a path inside a publicly synced/repository directory.
    """
    p = Path(path).expanduser()
    if p.is_symlink() or not p.parent.is_dir() or p.parent.is_symlink():
        raise ValueError("Wymagana lokalna sciezka bez symlinkow")
    snapshot = make_snapshot(devices, observed_at)
    line = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n"
    fd = os.open(str(p), os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if not os.path.isfile(p):
            raise ValueError("Archiwum musi byc zwyklym plikiem")
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            fd = -1
            stream.write(line)
    finally:
        if fd != -1:
            os.close(fd)
