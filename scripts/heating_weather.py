"""Trace and resolve revisions of archived Open-Meteo ICON-EU values."""

import argparse
import os
import re
import subprocess
from collections import defaultdict
from pathlib import Path

from heating_capture import DATA_PATH, WEATHER, encode, read_json, stamp, utc, weather_temperature

ORIGINS_PATH = "analityka/v1/pogoda-pochodzenie-v1.json"
HOUR = 3600
COMMIT = re.compile(r"[a-f0-9]{40}")
FILENAME = re.compile(r"\d{4}-\d{2}-\d{2}-[a-f0-9]{20}\.json")
RULE = "icon-eu-rewizje-v1"


def git_origins(root):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args], text=True)

    if Path(git("rev-parse", "--show-toplevel").strip()).resolve() != root.resolve():
        raise ValueError("Wymagany jest katalog główny prywatnego archiwum Git")
    if git("rev-parse", "--is-shallow-repository").strip() != "false":
        raise ValueError("Wymagana jest pełna historia Git partii")
    head = git("rev-parse", "HEAD").strip()
    log = git("log", "--first-parent", "--reverse", "--diff-merges=first-parent", "--no-renames",
              "--format=@%H %cI", "--name-status", head, "--", DATA_PATH)
    batches = {}
    changed = set()
    order = 0
    for line in log.splitlines():
        if not line:
            continue
        if line.startswith("@"):
            commit, published = line[1:].split()
            order += 1
            origin = {"commit": commit, "published_at": utc(stamp(published)), "order": order}
            continue
        status, path = line.split("\t", 1)
        name = Path(path).name
        if status != "A" or name in batches:
            changed.add(name)
        else:
            batches[name] = origin
    trusted = {}
    for name, origin in sorted(batches.items()):
        path = root / DATA_PATH / name
        if name in changed or not FILENAME.fullmatch(name) or not path.is_file():
            continue
        if not read_json(path)["events"].get(WEATHER):
            continue
        if git("hash-object", f"{DATA_PATH}/{name}").strip() != git("rev-parse", f"{head}:{DATA_PATH}/{name}").strip():
            continue
        trusted[name] = origin
    return {"version": 1, "archive_head": head, "batches": trusted}


def read_origins(path):
    if not path.is_file():
        return {}
    source = read_json(path)
    if source.get("version") != 1 or not COMMIT.fullmatch(source.get("archive_head", "")):
        raise ValueError("Nieprawidłowy indeks pochodzenia pogody")
    result = {}
    by_order = {}
    by_commit = {}
    for batch, row in source["batches"].items():
        order = row["order"]
        if not FILENAME.fullmatch(batch) or not COMMIT.fullmatch(row["commit"]) or type(order) is not int or order < 1:
            raise ValueError("Nieprawidłowy wpis pochodzenia pogody")
        published = utc(stamp(row["published_at"]))
        item = {"published_at": published, "order": order, "commit": row["commit"]}
        if by_order.setdefault(order, item) != item or by_commit.setdefault(row["commit"], item) != item:
            raise ValueError("Niejednoznaczna kolejność publikacji partii pogody")
        result[batch] = item
    return result


def weather_candidates(rows, batch, fetched, origin, start, end):
    """Reject invalid rows only for this model, leaving archive files intact."""
    valid = defaultdict(list)
    rejected = []
    if fetched is not None:
        try:
            fetched = stamp(fetched)
        except (AttributeError, ValueError, TypeError, OverflowError):
            fetched = None
        if fetched is None or fetched < end:
            rejected.append({"batch": batch, "reason": "invalid_acquisition"})
            fetched = None
    for index, row in enumerate(rows, 1):
        event = row[0] if isinstance(row, (list, tuple)) and row else None
        try:
            at = stamp(event)
        except (AttributeError, ValueError, TypeError, OverflowError):
            rejected.append({"batch": batch, "row": index, "reason": "invalid_timestamp"})
            continue
        if at % HOUR or not start <= at < end:
            rejected.append({"batch": batch, "row": index, "hour": utc(at), "reason": "outside_hour_or_batch"})
            continue
        value = weather_temperature(row[1]) if len(row) == 2 else None
        if value is None:
            rejected.append({"batch": batch, "row": index, "hour": utc(at), "reason": "invalid_temperature"})
            continue
        candidate = {"value": value, "batch": batch}
        if fetched is not None:
            candidate["fetched_at"] = utc(fetched)
        if origin is not None:
            candidate.update(origin)
        valid[at].append(candidate)
    return valid, rejected


def resolve(candidates):
    """Prefer actual retrieval times or the order in which legacy batches were published."""
    def choice(rows):
        return min(rows, key=lambda row: row["batch"])

    if len({r["value"] for r in candidates}) == 1:
        # No revision ordering is needed to agree on the value.
        return choice(candidates), "agreement"
    fetched = [r for r in candidates if "fetched_at" in r]
    legacy = [r for r in candidates if "fetched_at" not in r and "order" in r]
    unknown = [r for r in candidates if "fetched_at" not in r and "order" not in r]
    if fetched:
        acquisition = max(stamp(r["fetched_at"]) for r in fetched)
        newest = [r for r in fetched if stamp(r["fetched_at"]) == acquisition]
        # A legacy publication is only an upper bound on when it was retrieved.
        competing = [r for r in legacy if stamp(r["published_at"]) >= acquisition]
        method = "fetched_at"
    elif legacy:
        newest_order = max(r["order"] for r in legacy)
        newest = [r for r in legacy if r["order"] == newest_order]
        competing = []
        method = "first_publication"
    else:
        return None, "unresolved"
    if len({r["value"] for r in newest + competing + unknown}) != 1:
        return None, "unresolved"
    return choice(newest), method


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="Pełny prywatny checkout Git")
    parser.add_argument("--output", type=Path, required=True, help="Nowy plik indeksu w prywatnym katalogu")
    args = parser.parse_args()
    data = encode(git_origins(args.archive))
    os.umask(0o077)
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write(data)


if __name__ == "__main__":
    main()
