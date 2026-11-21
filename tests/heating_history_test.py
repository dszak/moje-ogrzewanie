"""Synthetic tests for historical analysis and private-only publication."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from heating_archive import API, BRANCH, PrivateArchive, check_batch, git_blob, record_once
from heating_capture import DATA_PATH, ROOMS, WEATHER, encode, midnight, utc, write_batch
from heating_report import (Archive, apartment_series, apportion_exact, compare, demand_statistics, gas_intervals,
                            report, statistics, steps, timeline, weather)


REPO = "example/private-heating"
REPO_API = API + REPO
SOURCE = "test-source"


def demand(at, value, event=None):
    return at, value, (at if event is None else event) * 1000, SOURCE


class HistoryTest(unittest.TestCase):
    def test_restart_requires_fresh_observation(self):
        rows = [demand(110, "on"), demand(162, "on", 110), demand(170, "off"),
                demand(195, "on")]
        series = steps(rows, [(100, 145, False), (160, 200, False)], demand=True)
        stats = demand_statistics(series, 100, 200)
        self.assertEqual(stats["on"]["seconds"], 40)
        self.assertEqual(stats["off"]["seconds"], 25)
        self.assertEqual(stats["missing_s"], 35)
        self.assertEqual(stats["gaps"], [[utc(100), utc(110)], [utc(145), utc(170)]])
        self.assertEqual(stats["off"]["complete_intervals"], 0)

    def test_unavailable_gap_and_single_engo_event_double_update(self):
        rows = [demand(0, "off"), demand(10, "off"), demand(10.0005, "on", 10),
                (20, None, None, None), demand(30, "on", 10), demand(40, "off"),
                demand(45, "on"), demand(50, "off"), demand(60, "on")]
        series = steps(rows, [(0, 70, False)], demand=True)
        stats = demand_statistics(series, 0, 70)
        self.assertEqual(stats["gaps"], [[utc(20), utc(40)]])
        self.assertAlmostEqual(stats["on"]["seconds"], 24.9995)
        self.assertEqual(stats["on"]["complete_intervals"], 1)
        self.assertEqual(stats["on"]["mean_complete_s"], 5)
        self.assertEqual(stats["off"]["complete_intervals"], 1)
        self.assertAlmostEqual(stats["on"]["share"] + stats["off"]["share"], 1)

    def test_unclean_restart_ends_at_last_confirmed_record(self):
        rows = [demand(0, "off"), demand(10, "on"), demand(30, "on", 10),
                demand(65, "off")]
        series = steps(rows, [(0, 60, True), (62, 80, False)], demand=True)
        self.assertEqual(series, [(0, 10, "off"), (10, 30, "on"), (65, 80, "off")])

    def test_crash_tail_with_no_coverage_stays_unknown(self):
        stats = demand_statistics([], 0, 25)
        self.assertEqual(stats["observed_s"], 0)
        self.assertEqual(stats["missing_s"], 25)
        self.assertIsNone(stats["off"]["share"])

    def test_time_weighted_measurements_and_settings_changes(self):
        series = steps([(0, 20), (30, 25), (40, None), (50, 22)], [(0, 60, False)])
        values = statistics(series, 60)
        self.assertEqual(values["mean"], (20 * 30 + 25 * 10 + 22 * 10) / 50)
        self.assertEqual((values["missing_s"], values["min"], values["max"]), (10, 20, 25))
        settings = timeline([(0, 10, 50), (10, 60, 55)], 5, 30)
        self.assertEqual([(row["seconds"], row["value"]) for row in settings], [(5, 50), (20, 55)])
        self.assertEqual(steps([(0, 20)], [(0, 60, False)], max_age=25), [(0, 25, 20)])

    def test_apartment_weights_only_shared_observation(self):
        rooms = {"room1": [(0, 30, 20)], "room2": [(10, 40, 24)]}
        self.assertEqual(apartment_series(rooms, {"room1": 1, "room2": 3}), [(10, 30, 23)])
        self.assertEqual(apartment_series(rooms, {"room1": 1}), [])

    def test_local_calendar_day_dst_and_hourly_model(self):
        spring = midnight("2026-03-29"), midnight("2026-03-30")
        autumn = midnight("2026-10-25"), midnight("2026-10-26")
        for (a, b), hours in ((spring, 23), (autumn, 25)):
            self.assertEqual(b - a, hours * 3600)
            series = [(i, i + 3600, 11.5) for i in range(int(a), int(b), 3600)]
            result = weather(series, a, b, hourly=True)
            self.assertEqual(result["missing_s"], 0)
            self.assertEqual(len(result["hours"]), hours)
            self.assertAlmostEqual(result["hdd_21_5"], 10 * hours / 24)

    def test_previous_archive_preservation_and_late_rows(self):
        start = midnight("2026-01-01")
        stop = midnight("2026-01-02")
        confirm = utc(start + 120)
        batch = {
            "version": 1, "since": utc(start), "until": utc(stop),
            "recorder_runs": [[1, utc(start), None, False]],
            "events": {WEATHER: [[utc(start), 1.0]],
                       "engo.demand": [[confirm, "off", (start + 120) * 1000, SOURCE]]},
        }
        with tempfile.TemporaryDirectory() as temp:
            archive_path = Path(temp)
            first = write_batch(archive_path, batch)
            old = first.read_bytes()
            self.assertEqual(first, write_batch(archive_path, batch))
            self.assertEqual(check_batch(first), encode(batch))
            existing = Archive(archive_path)
            before = report(existing, "2026-01-01", "2026-01-02")
            self.assertEqual(before, report(Archive(archive_path), "2026-01-01", "2026-01-02"))
            batch["events"][WEATHER].append([utc(start + 3600), 2.0])
            batch["events"]["engo.demand"].append(
                [utc(start + 3600), "on", (start + 3600) * 1000, SOURCE])
            batch["recorder_runs"] = [[1, utc(start), utc(start + 7200), False]]
            revised = write_batch(archive_path, batch)
            after = report(Archive(archive_path), "2026-01-01", "2026-01-02")
            self.assertNotEqual(revised, first)
            self.assertEqual(first.read_bytes(), old)
            self.assertEqual(after["days"][0]["weather"]["covered_s"], 7200)
            self.assertEqual(after["days"][0]["engo"]["observed_s"], 7080)
            self.assertEqual(after["days"][0]["engo"]["on"]["seconds"], 3600)
            self.assertIsNone(after["days"][0]["gas_at_exact_boundaries"])
            self.assertIsNone(after["days"][0]["rooms"]["hall"]["below_confirmed_target_s"])

    def test_gas_replay_deduplicates_and_keeps_actual_periods(self):
        def event(ident, record, at=0, gas=0, meter="new", op="upsert"):
            return {"id": ident, "record_id": record, "op": op,
                    "reading": {"at": utc(at), "gas": gas, "meter": meter}}
        reading = event("r2", "second", 20, 105)
        events = [event("r1", "first", 10, 100), reading, reading,
                  event("r3", "third", 30, 110), event("r4", "third", op="delete"),
                  event("r5", "other", 35, 900, meter="old"), event("r6", "last", 45, 110)]
        result = list(gas_intervals({"events": events}))
        self.assertEqual(result, [(10, 20, 5, "new"), (20, 45, 5, "new")])
        self.assertEqual(apportion_exact(result, 10, 45), {"m3": 10, "meter": "new"})
        self.assertIsNone(apportion_exact(result, 10, 30))
        conflict = event("r7", "extra", 20, 101)
        self.assertEqual(list(gas_intervals({"events": [*events, conflict]})), [])

    def test_weather_similarity_requires_distribution_and_coverage(self):
        def sample(i, bins, weather_seconds=86400):
            return {"start": utc(i * 86400), "end": utc((i + 1) * 86400), "seconds": 86400,
                    "weather": {"mean": 6, "bins": bins, "covered_s": weather_seconds},
                    "engo": {"observed_s": 86400, "on": {"share": 0.2}},
                    "rooms": {r: {"temperature": {"covered_s": 86400, "mean": 20}} for r in ROOMS},
                    "boiler_co_declared": [], "gas_at_exact_boundaries": None}
        reference = sample(1, [0, 0.3, 0.7, 0, 0, 0])
        matches = compare([sample(2, [0, 0.4, 0.6, 0, 0, 0]),
                           sample(3, [0.5, 0, 0, 0.5, 0, 0]),
                           sample(4, [0, 0.4, 0.6, 0, 0, 0], 100)], against=reference)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["result"], "nierozstrzygnięty")


class PrivateArchiveTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.path = DATA_PATH + "/2026-01-02-0123456789abcdefabcd.json"
        self.additions = {}
        self.sha = "a"

    def api(self, url, token, payload=None, method=None):
        self.assertEqual(token, "synthetic")
        self.assertTrue(url.startswith(REPO_API))
        path = url[len(REPO_API):]
        self.calls.append((path, payload, method))
        if path == "":
            return {"full_name": REPO, "private": True, "visibility": "private",
                    "default_branch": "main", "permissions": {"push": True}}
        if path.startswith("/git/ref/"):
            return {"object": {"sha": self.sha}}
        if path.startswith("/git/commits/"):
            return {"tree": {"sha": self.sha}}
        if path == "/git/trees":
            return {"sha": "new-tree"}
        if path == "/git/commits":
            return {"sha": "b"}
        if path.startswith("/git/refs/"):
            self.assertFalse(payload["force"])
            self.additions = {self.path: "example"}
            self.sha = payload["sha"]
            return {"object": {"sha": self.sha}}
        if path.startswith("/git/trees/"):
            paths = [("analityka", "d"), ("v1", "e"), ("partie", "f")]
            tree = path.split("/")[-1]
            if tree == "f":
                return {"tree": [{"path": p.split("/")[-1], "sha": git_blob(c), "type": "blob"}
                                 for p, c in self.additions.items()]}
            index = {"a": 0, "b": 0, "d": 1, "e": 2}[tree]
            name, sha = paths[index]
            return {"tree": [{"path": name, "sha": sha, "type": "tree"}] if self.additions else []}
        self.fail(f"Unexpected request {path}")

    def test_private_idempotent_fast_forward_and_no_overwrite(self):
        archive = PrivateArchive("synthetic", REPO, BRANCH, self.api)
        self.assertEqual(archive.publish({self.path: "example"}), ("b", 1))
        self.assertEqual(archive.publish({self.path: "example"}), ("b", 0))
        with self.assertRaisesRegex(RuntimeError, "inną zawartością"):
            archive.publish({self.path: "different"})
        with self.assertRaisesRegex(ValueError, "Niedozwolony"):
            archive.publish({"sync/gazomierz-v1.json": "example"})

    def test_public_destination_aborts_before_any_write(self):
        def public(url, token, payload=None, method=None):
            self.assertEqual(url, REPO_API)
            return {"full_name": REPO, "private": False}
        archive = PrivateArchive("synthetic", REPO, request=public)
        with self.assertRaisesRegex(RuntimeError, "prywatności"):
            archive.publish({self.path: "example"})

    def test_failed_publication_retains_spool_and_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            status_file = Path(tmp) / "status.json"
            error = HTTPError(API, 503, "test", None, None)
            with patch("heating_archive.collect", return_value=([], {})), \
                 patch("heating_archive.publish_existing", side_effect=error):
                with self.assertRaises(HTTPError):
                    record_once(None, {"ha_url": "https://example.invalid"}, status_file, now=1_770_000_000)
            status = json.loads(status_file.read_text())
            self.assertEqual(status["result"], "failed")
            self.assertNotIn("succeeded_until", status)


if __name__ == "__main__":
    unittest.main()
