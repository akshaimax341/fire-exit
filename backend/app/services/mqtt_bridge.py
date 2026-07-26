"""Optional MQTT bridge for multi-node hazard vector exchange."""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class MQTTBridge:
    """
    Publishes localized hazard vectors to MQTT topics.
    Protocol: fireexit/{node_id}/hazard
    Fail-safe: if broker unavailable, simulation continues with local state.
    """

    def __init__(self, broker: str = "localhost", port: int = 1883, prefix: str = "fireexit"):
        self.broker = broker
        self.port = port
        self.prefix = prefix
        self._client = None
        self.connected = False

    def connect(self) -> bool:
        try:
            import paho.mqtt.client as mqtt

            self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            self._client.on_connect = self._on_connect
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
            client.subscribe(f"{self.prefix}/+/cmd")

    def publish_hazard(self, node_id: str, hazard: dict):
        if not self._client or not self.connected:
            return
        topic = f"{self.prefix}/{node_id}/hazard"
        try:
            self._client.publish(topic, json.dumps(hazard), qos=0)
        except Exception as e:
            logger.warning("MQTT publish failed: %s", e)

    def publish_path(self, node_id: str, path: list):
        if not self._client or not self.connected:
            return
        topic = f"{self.prefix}/{node_id}/path"
        try:
            self._client.publish(topic, json.dumps({"path": path}), qos=0)
        except Exception:
            pass

    def disconnect(self):
        if self._client:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass
        self.connected = False
