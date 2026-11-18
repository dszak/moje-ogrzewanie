"""Offline tests for SETTI+ TRV DPS history — synthetic data only."""
import base64
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "trv_dps_history", Path(__file__).resolve().parents[1] / "scripts/trv_dps_history.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def devices(vals=None):
    vals = vals if vals is not None else [70] * 19 + [34] + [0] * 4
    encoded = base64.b64encode(bytes(vals)).decode("ascii")
    return {f"TRV{n} {n}": {"category": "wk", "local_key": "do-not-log",
                         "dps": {"119": encoded, "3": "standy", "104": 0,
                                 "101": True, "110": "PRIVATE-SCHEDULE"}}
            for n in range(1, 9)}


class HistoryTests(unittest.TestCase):
    def test_valid_24_values(self):
        vals = [0, 1, 27, 74, 100] + [0] * 19
        self.assertEqual(MODULE.decode_dps119(base64.b64encode(bytes(vals)).decode()), vals)

    def test_invalid_history_does_not_become_zero(self):
        for value in ("", "0" * 32, "*" * 32, base64.b64encode(bytes([101] + [0] * 23)).decode()):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MODULE.decode_dps119(value)

    def test_privacy_and_timestamp(self):
        obj = MODULE.make_snapshot(devices(), datetime(2026, 11, 18, 19, tzinfo=timezone.utc))
        self.assertEqual(set(obj["heads"]), {f"g{n}" for n in range(1, 9)})
        self.assertEqual(obj["heads"]["g5"]["dps119_day_indexed_percent"][19], 34)
        self.assertEqual(obj["history_index_time_mapping"], "unverified")
        self.assertEqual(obj["heads"]["g5"]["status_raw"]["work_state_raw"], "standy")
        self.assertNotIn("do-not-log", str(obj))
        self.assertNotIn("PRIVATE-SCHEDULE", str(obj))
        self.assertNotIn("local_key", str(obj))

    def test_missing_history_is_unknown(self):
        data = devices()
        del data["TRV6 6"]["dps"]["119"]
        self.assertIsNone(MODULE.make_snapshot(data)["heads"]["g6"]["dps119_day_indexed_percent"])

    def test_duplicate_head_rejected(self):
        data = devices()
        data["TRV5 second"] = data["TRV5 5"]
        with self.assertRaises(ValueError):
            MODULE.make_snapshot(data)

    def test_private_append(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "head-history.jsonl"
            MODULE.append_private_jsonl(devices(), path)
            self.assertEqual(len(path.read_text().splitlines()), 1)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
