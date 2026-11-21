"""Configure the hash of a dedicated synchronization key."""
import re

import voluptuous as vol
from homeassistant import config_entries

from . import DOMAIN


class BoilerNoteFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        errors = {}
        if user_input is not None:
            key_hash = user_input["key_hash"].lower()
            if re.fullmatch(r"[a-f0-9]{64}", key_hash):
                return self.async_create_entry(
                    title="Ręczna nastawa CO", data={"key_hash": key_hash}
                )
            errors["base"] = "invalid_auth"
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("key_hash"): str}),
            errors=errors,
        )
