"""Weather revision and time-alignment regression tests using synthetic samples."""

import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from heating_archive import check_batch
from heating_capture import WEATHER, capture_weather, encode, midnight, stamp, utc, write_batch
from heating_report import Archive, compare_gas, report
from heating_weather import HOUR, ORIGINS_PATH, git_origins


class WeatherRevisionTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.start = midnight("2026-01-01")
        self.end = midnight("2026-01-02")

    def batch(self, values, fetched=None, other=None, start=None, end=None):
        a = self.start if start is None else start
        b = self.end if end is None else end
        data = {"version": 1, "since": utc(a), "until": utc(b), "recorder_runs": [],
                "events": {WEATHER: values, **(other or {})}}
        if fetched is not None:
            data["weather_fetched_at"] = utc(fetched)
        return write_batch(self.root, data)

    def test_several_revisions_prefer_acquisition_and_never_fill_a_gap(self):
        at = self.start
        read1 = self.batch([[utc(at), 1.0]], self.end + 10)
        read2 = self.batch([[utc(at), 0.9]], self.end + 20)
        read3 = self.batch([[utc(at), 0.8], [utc(at + 2 * HOUR), 2.0]], self.end + 30)
        repeat = self.batch([[utc(at + 2 * HOUR), 2.0]], self.end + 40)
        originals = {p: p.read_bytes() for p in (read1, read2, read3, repeat)}
        archive = Archive(self.root)
        result = report(archive, "2026-01-01", "2026-01-02")
        self.assertEqual(encode(result), encode(report(Archive(self.root), "2026-01-01", "2026-01-02")))
        sources = result["weather_provenance"]
        self.assertEqual(sources["selected"][utc(at)]["batch"], read3.name)
        self.assertEqual(sources["selected"][utc(at)]["method"], "fetched_at")
        self.assertEqual(len(sources["revisions"][utc(at)]["candidates"]), 3)
        self.assertEqual(sources["selected"][utc(at + 2 * HOUR)]["method"], "agreement")
        self.assertIn(utc(at + HOUR), sources["absent_hours"])
        self.assertIsNone(archive.weather_at(at + HOUR + 20))
        self.assertEqual(archive.weather_at(at + 7)["seconds_from_hour_start"], 7)
        self.assertEqual(archive.weather_at(at + 7)["value"], 0.8)
        self.assertTrue(all(path.read_bytes() == body and check_batch(path) == body.decode()
                            for path, body in originals.items()))
        stats = result["period"]["weather"]
        self.assertEqual(stats["covered_s"], 2 * HOUR)
        self.assertAlmostEqual(stats["mean"], 1.4)
        self.assertAlmostEqual(stats["hdd_21_5"], (21.5 - .8 + 21.5 - 2) / 24)

    def test_invalid_values_and_naive_or_off_grid_times_are_diagnostic(self):
        at = self.start
        self.batch([[utc(at), 4.0]], self.end + 10)
        self.batch([[utc(at), True], [utc(at + 1), 2.5], [utc(at + HOUR), "4.2"],
                    ["2026-01-01T02:00:00", 5], [utc(at + 2 * HOUR), 200]], self.end + 20)
        archive = Archive(self.root)
        audit = archive.weather_audit(self.start, self.end)
        self.assertEqual(len(audit["rejected_rows"]), 5)
        self.assertEqual(audit["selected"][utc(at)]["value"], 4.0)
        self.assertEqual(len(audit["absent_hours"]), 23)

    def test_unordered_or_tied_conflicts_remain_unknown_but_agreement_is_usable(self):
        at = self.start
        next_hour = at + HOUR
        self.batch([[utc(at), 2], [utc(next_hour), 4]])
        self.batch([[utc(at), 3], [utc(next_hour), 4]])
        tie = at + 2 * HOUR
        self.batch([[utc(tie), 7]], self.end + 1)
        self.batch([[utc(tie), 8]], self.end + 1)
        archive = Archive(self.root)
        audit = archive.weather_audit(self.start, self.end)
        self.assertEqual(audit["unresolved_hours"], [utc(at), utc(tie)])
        self.assertEqual(audit["selected"][utc(next_hour)]["value"], 4)

    def test_first_publication_traces_immutable_legacy_batches(self):
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()

        git("init", "-q")
        git("config", "user.email", "test@example.invalid")
        git("config", "user.name", "Weather test")
        old = self.batch([[utc(self.start), 2], [utc(self.start + HOUR), 4]])
        git("add", ".")
        git("commit", "-qm", "First capture")
        later = self.batch([[utc(self.start), 3], [utc(self.start + HOUR), 5]])
        # An opposing version of the second hour appeared in the same publication.
        self.batch([[utc(self.start + HOUR), 6]])
        git("add", ".")
        git("commit", "-qm", "Second capture")
        index = git_origins(self.root)
        path = self.root / ORIGINS_PATH
        path.write_text(encode(index))
        audit = Archive(self.root).weather_audit(self.start, self.end)
        self.assertEqual(audit["selected"][utc(self.start)]["batch"], later.name)
        self.assertEqual(audit["selected"][utc(self.start)]["method"], "first_publication")
        self.assertEqual(audit["unresolved_hours"], [utc(self.start + HOUR)])
        old.write_text(json.dumps({"events": {WEATHER: [[utc(self.start), 4]]}}))
        git("add", str(old))
        git("commit", "-qm", "Unexpected modification")
        self.assertNotIn(old.name, git_origins(self.root)["batches"])

    def test_mixed_new_and_legacy_revisions_need_an_unambiguous_order(self):
        at = self.start
        legacy = self.batch([[utc(at), 3], [utc(at + HOUR), 2]])
        path = self.root / ORIGINS_PATH
        path.write_text(encode({"version": 1, "archive_head": "a" * 40, "batches": {
            legacy.name: {"order": 1, "commit": "b" * 40, "published_at": utc(self.end + 10)}
        }}))
        self.batch([[utc(at), 4]], self.end + 20)
        self.batch([[utc(at + HOUR), 3]], self.end + 5)
        audit = Archive(self.root).weather_audit(self.start, self.end)
        self.assertEqual(audit["selected"][utc(at)]["value"], 4)
        self.assertEqual(audit["unresolved_hours"], [utc(at + HOUR)])

    def test_warsaw_dst_uses_distinct_utc_hours(self):
        for day, next_day, count in (("2026-03-29", "2026-03-30", 23), ("2026-10-25", "2026-10-26", 25)):
            a, b = midnight(day), midnight(next_day)
            points = [[utc(t), 11.5] for t in range(int(a), int(b), HOUR)]
            if count == 25:
                hour = stamp("2026-10-25T02:00:00+02:00")
                self.assertNotEqual(hour, stamp("2026-10-25T02:00:00+01:00"))
                points = [[ts, 12 if stamp(ts) == hour else val] for ts, val in points]
            self.batch(points, b + 10, start=a, end=b)
            archive = Archive(self.root)
            result = report(archive, day, next_day)["period"]["weather"]
            self.assertEqual(result["covered_s"], count * HOUR)
            self.assertEqual(len(result["hours"]), count)

    def test_nonweather_conflicts_still_persist_as_unknown(self):
        at = self.start
        names = ["engo.demand", "trv.G1.temp", "room.smallbath.temp", "outdoor.met_no", "bath.dehumidifier.power_w"]
        left = {k: [[utc(at), 20]] for k in names}
        right = {k: [[utc(at), 21]] for k in names}
        left["engo.demand"] = [[utc(at), "on", int(at * 1000), "test"]]
        right["engo.demand"] = [[utc(at), "off", int(at * 1000), "test"]]
        self.batch([[utc(at), 2]], self.end + 10, other=left)
        self.batch([[utc(at), 3]], self.end + 20, other=right)
        a = Archive(self.root)
        for name in names:
            self.assertIsNone(a.events(name)[0][1])
        self.assertEqual(a.weather_at(at)["value"], 3)

    def test_gas_end_boundary_and_matching_require_full_model_coverage(self):
        at = self.start
        self.batch([[utc(at), 10], [utc(at + HOUR), 10]],
                   self.end + 10, end=self.end + 1)
        enabled = Archive(self.root)
        stable = (at, at + HOUR, 1, "new")
        uncovered = (at + 2 * HOUR, at + 3 * HOUR, 1, "new")
        next_day = (self.end - HOUR, self.end + 0.2, 1, "new")
        enabled.gas = [stable, uncovered, next_day]
        result = report(enabled, "2026-01-01", "2026-01-02")
        self.assertEqual(len(result["gas_intervals"]), 2)
        self.assertAlmostEqual(result["gas_intervals"][0]["m3_per_hdd"], 24 / 11.5)
        self.assertIsNone(result["gas_intervals"][1]["m3_per_hdd"])
        self.assertEqual(compare_gas(enabled, (at, at + HOUR), (at + 2 * HOUR, at + 3 * HOUR)), [])

    def test_capture_accepts_hourly_epoch_seconds_and_celsius_only(self):
        at = int(self.start)
        response = {"utc_offset_seconds": 0, "hourly_units": {"time": "unixtime", "temperature_2m": "°C"},
                    "hourly": {"time": [at, at+1, at+HOUR, at+2*HOUR], "temperature_2m": [1, 2, math.nan, None]}}
        with patch("heating_capture.request_json", return_value=response):
            self.assertEqual(capture_weather(at, at + 3 * HOUR, {"latitude": 0, "longitude": 0}),
                             [[utc(at), 1]])
            response["hourly_units"]["temperature_2m"] = "°F"
            with self.assertRaises(ValueError):
                capture_weather(at, at + 3 * HOUR, {"latitude": 0, "longitude": 0})


if __name__ == "__main__":
    unittest.main()
