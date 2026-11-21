"""Storage model for an informational setting."""
from datetime import datetime, timezone
import json
import os
from tempfile import NamedTemporaryFile


class StaleRevision(ValueError):
    """The last confirmed version has changed."""


def update_record(current, value, revision):
    """Return the next record without changing the current one."""
    if type(value) is not int or not 25 <= value <= 85:
        raise ValueError("invalid value")
    if type(revision) is not int or revision < 0:
        raise ValueError("invalid revision")
    if revision != current["revision"]:
        raise StaleRevision
    if value == current["value"]:
        return current
    return {
        "value": value,
        "revision": revision + 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def read_record(path):
    """Read the authoritative value and reject an invalid file."""
    try:
        with path.open(encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError:
        return None
    if (not isinstance(data, dict) or set(data) != {"value", "revision", "updated_at"}
            or type(data["value"]) is not int or not 25 <= data["value"] <= 85
            or type(data["revision"]) is not int or data["revision"] < 1
            or not isinstance(data["updated_at"], str)):
        raise ValueError("invalid stored CO setting")
    datetime.fromisoformat(data["updated_at"])
    return data


def write_record(path, data):
    """Replace the private record atomically; propagate write failures."""
    temporary = None
    try:
        with NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", delete=False) as file:
            temporary = file.name
            json.dump(data, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
