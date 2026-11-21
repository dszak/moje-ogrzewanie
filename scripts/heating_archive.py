"""Publish immutable heating batches in the existing private GitHub archive."""

import argparse
import base64
import fcntl
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote

from heating_capture import (
    DATA_PATH, HA_SERIES, HEAD_ROOMS, UTC, WARSAW, WEATHER, collect,
    encode, keychain, midnight, read_json, request_json, stamp, utc,
)
from heating_report import CO_CONFIRMATIONS, Archive, report

BRANCH = "codex/historical-heating-data"
API = "https://api.github.com/repos/"
BATCH_NAME = re.compile(r"\d{4}-\d{2}-\d{2}-[0-9a-f]{20}\.json")
ROLLUP_PATH = "analityka/v1/zestawienia"
CONTEXT_FILES = ("sync/gazomierz-v1.json", "karta/karta-instalacji.json")
SERIES = HA_SERIES | {WEATHER} | {f"trv_poll.{head}.{field}"
                                 for head in HEAD_ROOMS for field in ("temp", "target", "mode")}
REPORT_PATH = "analityka/v1/raporty"
REPORT_FILE = re.compile(r"\d{4}-\d{2}-\d{2}(?:--\d{2})?/(?:rewizja-\d{4}-\d{2}-\d{2}/)?raport\.(?:md|json)")
README = "analityka/v1/README.md"


def check_batch(path):
    name = path.name
    if not BATCH_NAME.fullmatch(name):
        raise ValueError("Nieprawidłowa nazwa partii")
    if path.stat().st_size > 2_000_000:
        raise ValueError("Partia przekracza dozwolony rozmiar")
    batch = read_json(path)
    if (set(batch) != {"version", "since", "until", "recorder_runs", "events"}
            or batch["version"] != 1 or not set(batch["events"]) <= SERIES):
        raise ValueError("Nieobsługiwana zawartość partii")
    raw = encode(batch)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:20]
    if name != f"{utc(stamp(batch['until']))[:10]}-{digest}.json":
        raise ValueError("Nazwa partii nie zgadza się z zawartością")
    return raw


def git_blob(text):
    raw = text.encode("utf-8")
    return hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()


def allowed_path(path):
    folder, _, filename = path.rpartition("/")
    if path in (README, CO_CONFIRMATIONS) or (path.startswith(REPORT_PATH + "/")
                          and REPORT_FILE.fullmatch(path[len(REPORT_PATH) + 1:])):
        return True
    return (
        folder in (DATA_PATH, ROLLUP_PATH) and BATCH_NAME.fullmatch(filename) is not None
    )


class PrivateArchive:
    def __init__(self, token, repository, branch=BRANCH, request=request_json):
        if not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9][A-Za-z0-9_.-]*", repository):
            raise ValueError("Nieprawidłowa nazwa prywatnego repozytorium")
        if branch not in (BRANCH, "main"):
            raise ValueError("Niedozwolona gałąź archiwum")
        self.request = request
        self.token = token
        self.repository = repository
        self.branch = branch
        self.branch_ref = quote("heads/" + branch, safe="/")

    def api(self, path="", payload=None, method=None):
        return self.request(API + self.repository + path, self.token, payload, method)

    def preflight(self):
        repo = self.api()
        if (repo["full_name"] != self.repository or repo.get("private") is not True
                or repo.get("visibility") != "private" or repo.get("archived")
                or repo.get("default_branch") != "main"
                or not repo.get("permissions", {}).get("push")):
            raise RuntimeError("Brak potwierdzenia prywatności lub prawa zapisu archiwum")

    def ref(self, ref=None):
        return self.api("/git/ref/" + (ref or self.branch_ref))["object"]["sha"]

    def make_branch(self):
        if self.branch == "main":
            raise ValueError("Gałąź główna powinna już istnieć")
        try:
            self.ref()
        except HTTPError as error:
            if error.code != 404:
                raise
            try:
                self.api("/git/refs", {"ref": "refs/heads/" + self.branch, "sha": self.ref("heads/main")})
            except HTTPError as create_error:
                if create_error.code != 422:
                    raise
                self.ref()  # Another invocation may have initialized it.

    def existing_files(self, tree_sha, paths):
        trees = {"": self.api("/git/trees/" + tree_sha)["tree"]}
        entries = {}
        for path in paths:
            parent = ""
            for name in path.split("/"):
                if parent not in trees:
                    break
                entry = next((x for x in trees[parent] if x["path"] == name), None)
                if entry is None:
                    break
                parent = f"{parent}/{name}" if parent else name
                if parent == path:
                    entries[path] = entry
                elif entry["type"] == "tree" and parent not in trees:
                    trees[parent] = self.api("/git/trees/" + entry["sha"])["tree"]
                elif entry["type"] != "tree":
                    raise RuntimeError("Konflikt ścieżki w archiwum")
        return entries

    def publish(self, entries):
        if not entries:
            raise ValueError("Brak partii do zapisu")
        if not all(map(allowed_path, entries)):
            raise ValueError("Niedozwolony plik archiwum analitycznego")
        self.preflight()
        for _ in range(4):
            parent = self.ref()
            base = self.api("/git/commits/" + parent)["tree"]["sha"]
            existing = self.existing_files(base, entries)
            additions = []
            for path, content in entries.items():
                if path in existing:
                    if existing[path]["sha"] != git_blob(content):
                        raise RuntimeError("Plik archiwum już istnieje z inną zawartością")
                    continue
                additions.append({"path": path, "mode": "100644", "type": "blob", "content": content})
            if not additions:
                return parent, 0
            tree = self.api("/git/trees", {"base_tree": base, "tree": additions})["sha"]
            commit = self.api("/git/commits", {
                "message": "data: dopisz partie historyczne ogrzewania",
                "tree": tree, "parents": [parent],
            })["sha"]
            try:
                ref = self.api("/git/refs/" + self.branch_ref, {
                    "sha": commit, "force": False,
                }, "PATCH")
                if ref["object"]["sha"] != commit:
                    raise RuntimeError("GitHub nie potwierdził zapisu partii")
                return commit, len(additions)
            except HTTPError as error:
                if error.code not in (409, 422) or self.ref() == parent:
                    raise
        raise RuntimeError("Kolejne zapisy zmieniały gałąź archiwum")

    def context(self, root, snapshot):
        if not re.fullmatch(r"snapshot/raport-HA-i-dziennik-\d{4}-\d{2}-\d{2}\.json", snapshot):
            raise ValueError("Nieprawidłowa ścieżka migawki odniesienia")
        self.preflight()
        revisions = {}
        ref = self.ref("heads/main")
        for name in (*CONTEXT_FILES, snapshot, CO_CONFIRMATIONS):
            try:
                data = self.api(f"/contents/{name}?ref={ref}")
            except HTTPError as error:
                if name == CO_CONFIRMATIONS and error.code == 404:
                    continue
                raise
            if data["encoding"] != "base64":
                raise ValueError("Nieobsługiwany format prywatnych danych kontekstowych")
            text = base64.b64decode(data["content"]).decode("utf-8")
            if git_blob(text) != data["sha"]:
                raise ValueError("Kopia źródła raportu nie zgadza się z GitHubem")
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            revisions[name] = data["sha"]
        return revisions


def publish_existing(repo, root, include_report):
    entries = {f"{DATA_PATH}/{path.name}": check_batch(path)
               for path in sorted((root / DATA_PATH).glob("*.json"))}
    if include_report:
        entries[README] = (root / README).read_text(encoding="utf-8")
        for path in sorted((root / REPORT_PATH).rglob("raport.*")):
            name = path.relative_to(root).as_posix()
            if allowed_path(name):
                entries[name] = path.read_text(encoding="utf-8")
        confirmations = root / CO_CONFIRMATIONS
        if confirmations.is_file():
            entries[CO_CONFIRMATIONS] = confirmations.read_text(encoding="utf-8")
    return repo.publish(entries)


def write_status(path, status):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     delete=False) as stream:
        stream.write(encode(status))
        name = stream.name
    Path(name).replace(path)


def make_rollup(repo, cache, status_root, today, snapshot):
    with tempfile.TemporaryDirectory(dir=status_root) as context:
        revisions = repo.context(Path(context), snapshot)
        archive = Archive(cache, Path(context))
        end = today.isoformat()
        data = report(archive, (today - timedelta(days=7)).isoformat(), end, as_of=midnight(end))
        data.pop("archive_end")  # Unrelated later rows do not change a completed report.
        data["source_blobs"] = revisions
        raw = encode(data)
        digest = hashlib.sha256(raw.encode()).hexdigest()[:20]
        filename = f"{(today - timedelta(days=1)).isoformat()}-{digest}.json"
        repo.publish({f"{ROLLUP_PATH}/{filename}": raw})
    return filename


def record_once(repo, settings, status_file, now=None):
    previous = read_json(status_file) if status_file.exists() else {}
    now = int(datetime.now(UTC).timestamp()) if now is None else now
    stop = now - 120  # Account for Recorder's asynchronous commits.
    today = datetime.fromtimestamp(stop, WARSAW).date()
    previous_until = previous.get("succeeded_until")
    oldest = today - timedelta(days=8)
    recent = today - timedelta(days=2)
    if previous_until:
        prior = datetime.fromtimestamp(stamp(previous_until), WARSAW).date() - timedelta(days=1)
        recent = max(oldest, min(recent, prior))
    start = midnight(recent.isoformat())
    # Leave the local staged batches available for the next run if publishing fails.
    spool = status_file.parent / "spool"
    cache = status_file.parent / "cache"
    status = {**previous, "attempted_at": utc(now)}
    try:
        _, source_latest = collect(spool, start, stop, settings)
        staged = list((spool / DATA_PATH).glob("*.json"))
        commit, added = publish_existing(repo, spool, False)
        (cache / DATA_PATH).mkdir(parents=True, exist_ok=True)
        for path in staged:
            path.replace(cache / DATA_PATH / path.name)
        stale = []
        for source, maximum_age in (("room.poll", 30 * 60), (WEATHER, 2 * 3600)):
            if source not in source_latest or stop - stamp(source_latest[source]) > maximum_age:
                stale.append(source)
        try:
            status["rollup"] = make_rollup(repo, cache, status_file.parent, today, settings["snapshot"])
        except (OSError, ValueError, KeyError, RuntimeError) as error:
            stale.append("zestawienie")
            print(f"Nieukończone zestawienie {type(error).__name__}.", file=sys.stderr, flush=True)
        status.pop("error", None)
        status.update(succeeded_until=utc(stop), commit=commit, source_latest=source_latest, stale=stale,
                      result="partial" if stale else "ok")
        write_status(status_file, status)
        print(f"Archiwum do {utc(stop)}. Dodane pliki {added}. Wynik {status['result']}.", flush=True)
        if stale:
            print("Sprawdź źródła " + ", ".join(stale), file=sys.stderr, flush=True)
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        status.update(result="failed", error=type(error).__name__)
        write_status(status_file, status)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--branch", default=BRANCH, choices=(BRANCH, "main"))
    command = parser.add_subparsers(dest="command", required=True)
    publish = command.add_parser("publish")
    publish.add_argument("--archive", type=Path, required=True)
    publish.add_argument("--include-report", action="store_true")
    publish.add_argument("--create-branch", action="store_true")
    command.add_parser("run")
    args = parser.parse_args()
    os.umask(0o077)
    settings = read_json(args.config)
    token = keychain(settings["github_keychain_service"])
    archive = PrivateArchive(token, settings["repository"], args.branch)
    if args.command == "publish":
        if args.create_branch:
            archive.preflight()
            archive.make_branch()
        commit, count = publish_existing(archive, args.archive, args.include_report)
        print(f"Zapis {commit}. Dodane pliki {count}.")
    else:
        with args.config.with_name("run.lock").open("a", encoding="utf-8") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            record_once(archive, settings, args.config.with_name("status.json"))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        details = f" HTTP {error.code}" if isinstance(error, HTTPError) else ""
        sys.exit(f"Archiwizacja nieukończona: {type(error).__name__}{details}")
