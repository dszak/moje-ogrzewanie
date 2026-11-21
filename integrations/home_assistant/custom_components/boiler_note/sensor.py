"""Read-only entity for the last confirmed manual CO setting."""
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from . import SIGNAL


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([ReportedSetting(entry.runtime_data)])


class ReportedSetting(SensorEntity):
    _attr_name = "Kocioł CO nastawa ręczna"
    _attr_unique_id = "boiler_note_co_setting"
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_should_poll = False

    def __init__(self, note):
        self.note = note

    @property
    def native_value(self):
        return self.note.record["value"]

    @property
    def extra_state_attributes(self):
        return {"updated_at": self.note.record["updated_at"]}

    async def async_added_to_hass(self):
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL, self.async_write_ha_state)
        )
