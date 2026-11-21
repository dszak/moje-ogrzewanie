"""Test the durable source independently from a running Home Assistant."""
import importlib.util
from pathlib import Path
import stat
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "boiler_note_record",
    Path(__file__).resolve().parents[1] / "integrations/home_assistant/custom_components/boiler_note/record.py",
)
record = importlib.util.module_from_spec(spec)
spec.loader.exec_module(record)


class BoilerNoteTest(unittest.TestCase):
    def setUp(self):
        self.empty = {"value": None, "revision": 0, "updated_at": None}

    def test_private_record_survives_reopen_and_updates_atomically(self):
        with TemporaryDirectory() as root:
            file = Path(root) / "co"
            self.assertIsNone(record.read_record(file))
            first = record.update_record(self.empty, 55, 0)
            record.write_record(file, first)
            self.assertEqual(record.read_record(file), first)
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
            second = record.update_record(record.read_record(file), 56, 1)
            record.write_record(file, second)
            self.assertEqual(record.read_record(file), second)

    def test_write_failure_keeps_previous_record(self):
        with TemporaryDirectory() as root:
            file = Path(root) / "co"
            first = record.update_record(self.empty, 55, 0)
            record.write_record(file, first)
            with patch.object(record.os, "replace", side_effect=OSError("unavailable")):
                with self.assertRaises(OSError):
                    record.write_record(file, record.update_record(first, 56, 1))
            self.assertEqual(record.read_record(file), first)
            self.assertEqual(list(Path(root).iterdir()), [file])

    def test_stale_revision_invalid_value_and_duplicate(self):
        first = record.update_record(self.empty, 55, 0)
        self.assertIs(record.update_record(first, 55, 1), first)
        with self.assertRaises(record.StaleRevision):
            record.update_record(first, 56, 0)
        for value in (None, True, "55", 55.5, 24, 86):
            with self.assertRaises(ValueError):
                record.update_record(first, value, 1)


if __name__ == "__main__":
    unittest.main()
