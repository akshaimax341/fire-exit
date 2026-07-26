"""MQTT bridge — device telemetry topics + command bus."""

from __future__ import annotations

import json
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class MQTTBridge:
    """
    Publish:  fireexit/device/{deviceId}
    Subscribe: fireexit/commands/#
    Legacy:    fireexit/{node}/hazard still supported for sim nodes.
    """

    def __init__(self, broker: str = "localhost", port: int = 1883, prefix: str = "fireexit"):
        self.broker = broker
        self.port = port
        self.prefix = prefix
        self._client = None
        self.connected = False
        self._command_handler: Optional[Callable[[str, dict], None]] = None

    def set_command_handler(self, handler: Callable[[str, dict], None]):
        self._command_handler = handler

    def connect(self) -> bool:
        try:
            import paho.mqtt.client as mqtt

            self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            self._client.on_connect = self._on_connect
            self._client.on_message = self._on_message
            self._client.connect_async(self.broker, self.port, 60)
            self._client.loop_start()
            return True
        except Exception as e:
            logger.warning("MQTT unavailable — fail-safe local mode: %s", e)
            self.connected = False
            return False

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = reason_code == 0
        if self.connected:
            client.subscribe(f"{self.prefix}/commands/#")
            client.subscribe(f"{self.prefix}/+/cmd")  # legacy
            logger.info("MQTT connected — subscribed to %s/commands/#", self.prefix)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            payload = {"raw": msg.payload.decode("utf-8", errors="ignore")}
        if self._command_handler:
            try:
                self._command_handler(msg.topic, payload if isinstance(payload, dict) else {})
            except Exception as e:
                logger.warning("MQTT command handler error: %s", e)

    def publish_device(self, device_id: str, state: dict):
        self._pub(f"{self.prefix}/device/{device_id}", state)

    def publish_hazard(self, node_id: str, hazard: dict):
        self._pub(f"{self.prefix}/{node_id}/hazard", hazard)

    def publish_path(self, node_id: str, path: list):
        self._pub(f"{self.prefix}/{node_id}/path", {"path": path})

    def publish_command(self, device_id: str, command: str, payload: dict | None = None):
        self._pub(
            f"{self.prefix}/commands/{device_id}",
            {"command": command, "payload": payload or {}},
        )

    def _pub(self, topic: str, data: dict):
        if not self._client or not self.connected:
            return
        try:
            self._client.publish(topic, json.dumps(data, default=str), qos=0)
        except Exception as e:
            logger.warning("MQTT publish failed (%s): %s", topic, e)

    def disconnect(self):
        if self._client:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass
        self.connected = False
