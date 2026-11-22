"""Regression tests for read-only bathroom history."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from bathroom_report import (air_water, analyze, classify, electrical_delta,
                             latest_daily_readings, paired_relay_events)
from heating_archive import check_batch
from heating_capture import capture_ha, midnight, normalise, stamp, utc, write_batch
from heating_report import Archive


class BathroomHistoryTest(unittest.TestCase):
    def test_only_relay_edges_form_intervals(self):
        data = {"version": 1, "source": "app_log_excerpt", "relay_events": [
            {"at": utc(t), "state": state} for t, state in
            [(5, "off"), (10, "on"), (10, "on"), (13, "off"),
             (20, "on"), (25, "on"), (26, "off"), (30, "on"), (30, "off")]],
            "scene_events": [{"at": utc(2), "state": "on"}]}
        self.assertEqual(paired_relay_events(data), [(10, 13, "on"), (25, 26, "on")])

    def test_unknown_does_not_become_off(self):
        demand = [(0, 20, "on"), (30, 60, "off")]
        heater = [(0, 15, "off"), (15, 18, "on"), (45, 60, "off")]
        socket = [(5, 20, "off"), (50, 60, "on")]
        self.assertEqual(classify(demand, heater, socket),
                         [(5, 15, "A"), (15, 18, "D"), (50, 60, "C")])
        self.assertEqual(classify(demand, [], socket), [])

    def test_counter_reset_disconnect_restart_and_repeat(self):
        rows = [(0, 4), (1, 4.5), (2, None), (3, 7), (4, 7.1),
                (6, 7.4), (8, 0.5), (9, 0.5), (10, 0.7)]
        windows = [(0, 5, False), (6, 11, False)]
        result = electrical_delta(rows, windows, 0, 11)
        self.assertAlmostEqual(result["kwh"], 0.8)
        self.assertEqual(result["resets"], 1)
        self.assertEqual(result["observed_s"], 4)
        self.assertEqual(electrical_delta([(3, 2)], windows, 0, 11)["kwh"], None)

    def test_daily_counter_is_local_last_sample_not_sum(self):
        a = midnight("2026-01-03")
        rows = [(a-600, 0.4), (a-100, 0.7), (a+200, 0.1), (a+300, 0.4)]
        w = [(a-800, a+800, False)]
        v = latest_daily_readings(rows)
        self.assertEqual([x["kwh"] for x in v.values()], [0.7, 0.4])
        self.assertAlmostEqual(electrical_delta(rows, w, a-800, a+800, daily=True)["kwh"], 0.6)

    def test_measurement_units_and_reported_element(self):
        def row(state, unit=None):
            return {"state": state, "attributes": {"unit_of_measurement": unit},
                    "last_updated": utc(2)}
        cases = [
            ("bath.convector.enabled", row("on"), "on"),
            ("bath.convector.element", row("unavailable"), None),
            ("bath.dehumidifier.relay", row("off"), "off"),
            ("bath.dehumidifier.power_w", row("0.05", "kW"), 50),
            ("bath.dehumidifier.power_w", row("123", "mA"), None),
            ("bath.dehumidifier.energy_day_kwh", row("155", "Wh"), 0.155),
            ("bath.dehumidifier.energy_total_kwh", row("4.155", "kWh"), 4.155),
            ("bath.convector.temp", row("68", "°F"), None),
            ("bath.convector.target", row("22", "°C"), 22),
        ]
        for key, sample, value in cases:
            with self.subTest(key=key):
                self.assertEqual(normalise(key, sample, [])[1], value)

    def test_existing_read_only_capture_retains_short_cycle(self):
        def reply(url, token, payload=None):
            if "/sql/query" in url:
                self.assertIn("SELECT", payload["query"])
                return {"service_response": {"result": [{
                    "run_id": 1, "started": "2026-01-01 00:00:00", "ended": None,
                    "closed_incorrect": 0}]}}
            self.assertIn("skip_initial_state=1", url)
            self.assertIn("significant_changes_only=0", url)
            return [[{"entity_id": "switch.example", "state": state, "attributes": {},
                      "last_updated": utc(start+i)} for i,state in [(1,"on"), (4,"off")]]]
        start = stamp("2026-01-01T00:00:00Z")
        with patch("heating_capture.request_json", side_effect=reply):
            rows,_ = capture_ha("https://example.invalid", "test", start, start+100,
                                {"bath.dehumidifier.relay":"switch.example"}, [])
        self.assertEqual(rows["bath.dehumidifier.relay"], [[utc(start+1),"on"],[utc(start+4),"off"]])

    def test_stored_bathroom_extension_is_additive_and_repeatable(self):
        a = midnight("2026-01-04")
        b = midnight("2026-01-05")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            baseline = write_batch(path, {"version":1,"since":utc(a),"until":utc(b),
                                          "recorder_runs":[[1,utc(a),None,False]], "events":{}})
            previous = baseline.read_bytes()
            extra = {"version":1,"since":utc(a),"until":utc(b),
                     "recorder_runs":[[1,utc(a),None,False]], "events":{
                         "bath.dehumidifier.relay":[[utc(a+1),"on"],[utc(a+7),"off"]],
                         "bath.dehumidifier.available":[[utc(a+2),"off"]],
                     }}
            current = write_batch(path, extra)
            self.assertEqual(current, write_batch(path, extra))
            self.assertEqual(baseline.read_bytes(), previous)
            check_batch(current)
            report = analyze(Archive(path), {"version":1,"source":"app_log_excerpt","relay_events":[]},
                             "2026-01-04","2026-01-05")
            self.assertEqual(report["balance_unknown_s"], b-a)
            self.assertEqual(report["electrical_history_s"]["bath.dehumidifier.relay"], 0)

    def test_absolute_humidity_distinguishes_heating_from_moisture_change(self):
        cold = air_water(20, 60)
        warm = air_water(22, 53.5)
        self.assertAlmostEqual(cold["abs_g_m3"], warm["abs_g_m3"], delta=0.1)
        self.assertAlmostEqual(cold["dew_c"], warm["dew_c"], delta=0.3)
        self.assertIsNone(air_water(22, None)["dew_c"])


if __name__ == "__main__":
    unittest.main()
