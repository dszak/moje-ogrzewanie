"""Private API for one manually recorded CO setting."""
from asyncio import IncompleteReadError, Lock
from hashlib import sha256
from hmac import compare_digest
import json
from pathlib import Path

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .record import StaleRevision, read_record, update_record, write_record

DOMAIN = "boiler_note"
SIGNAL = f"{DOMAIN}_updated"
APP_ORIGIN = "https://dszak.github.io"


class NoteStore:
    def __init__(self, hass, key_hash):
        self.hass = hass
        self.path = Path(hass.config.path(".storage", "boiler_note_record"))
        self.key_hash = key_hash
        self.record = {"value": None, "revision": 0, "updated_at": None}
        self.lock = Lock()

    async def load(self):
        if (record := await self.hass.async_add_executor_job(read_record, self.path)) is not None:
            self.record = record

    async def update(self, value, revision):
        async with self.lock:
            record = update_record(self.record, value, revision)
            if record is not self.record:
                await self.hass.async_add_executor_job(write_record, self.path, record)
                self.record = record
            return record


class BoilerNoteView(HomeAssistantView):
    url = "/api/boiler_note/v1"
    name = "api:boiler_note:v1"
    requires_auth = False
    cors_allowed = True

    def __init__(self, hass):
        self.hass = hass

    def _json(self, data, status=200):
        return web.json_response(data, status=status, headers={"Cache-Control": "no-store"})

    def _authorized_note(self, request):
        note = self.hass.data[DOMAIN].get("note")
        origin = request.headers.get("Origin")
        scheme, _, key = request.headers.get("Authorization", "").partition(" ")
        if (note is not None and origin in (None, APP_ORIGIN) and scheme == "Bearer"
                and len(key) == 64 and compare_digest(sha256(key.encode()).hexdigest(), note.key_hash)):
            return note
        return None

    async def get(self, request):
        if (note := self._authorized_note(request)) is None:
            return self._json({"error": "unauthorized"}, 401)
        return self._json(note.record)

    async def put(self, request):
        if (note := self._authorized_note(request)) is None:
            return self._json({"error": "unauthorized"}, 401)
        if request.content_type != "application/json":
            return self._json({"error": "invalid_media_type"}, 415)
        try:
            await request.content.readexactly(257)
        except IncompleteReadError as err:
            raw = err.partial
        else:
            return self._json({"error": "too_large"}, 413)
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict) or set(payload) != {"value", "revision"}:
                raise ValueError("invalid request")
            record = await note.update(payload["value"], payload["revision"])
        except StaleRevision:
            return self._json({"error": "conflict"}, 409)
        except (ValueError, UnicodeError):
            return self._json({"error": "invalid_setting"}, 400)
        except OSError:
            return self._json({"error": "storage_unavailable"}, 503)
        async_dispatcher_send(self.hass, SIGNAL)
        return self._json(record)


async def async_setup(hass, config):
    hass.data[DOMAIN] = {}
    hass.http.register_view(BoilerNoteView(hass))
    return True


async def async_setup_entry(hass, entry):
    note = NoteStore(hass, entry.data["key_hash"])
    await note.load()
    entry.runtime_data = note
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    hass.data[DOMAIN]["note"] = note
    return True


async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, ["sensor"]):
        return False
    hass.data[DOMAIN].pop("note", None)
    return True
