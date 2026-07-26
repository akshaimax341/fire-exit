"""In-memory ESP32 device registry with 15s offline timeout."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

from app.core.timeutil import iso_ms
from app.engines.hazard import SensorReading, compute_hazard, hazard_to_dict


OFFLINE_TIMEOUT_S = 15.0


@dataclass
class DeviceState:
    device_id: str
    room: str
    room_type: str = "ROOM"
    floor: int = 0
    node_id: Optional[str] = None
    temperature: float = 22.0
    humidity: float = 40.0
    gas: float = 0.0
    smoke: float = 0.0
    flame: bool = False
    status: str = "SAFE"
    battery: float = 100.0
    signal: float = -55.0
    occupancy: int = 0
    last_seen: float = field(default_factory=time.time)
    online: bool = True
    hazard: float = 0.0
    health: str = "ok"
    prev_temperature: float = 22.0
    prev_gas: float = 0.0
    mqtt_topic: str = ""
    retrieve_ms: float | None = None
    received_at: str | None = None
    received_at_ms: int | None = None
    device_timestamp_ms: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "room": self.room,
            "room_type": self.room_type,
            "floor": self.floor,
            "node_id": self.node_id,
            "temperature": round(self.temperature, 2),
            "humidity": round(self.humidity, 1),
            "gas": round(self.gas, 1),
            "smoke": round(self.smoke, 1),
            "flame": self.flame,
            "status": self.status,
            "battery": round(self.battery, 1),
            "signal": round(self.signal, 1),
            "occupancy": self.occupancy,
            "last_seen": iso_ms(datetime.utcfromtimestamp(self.last_seen)),
            "online": self.online,
            "hazard": round(self.hazard, 4),
            "health": self.health,
            "mqtt_topic": self.mqtt_topic or f"fireexit/device/{self.device_id}",
            "retrieve_ms": self.retrieve_ms,
            "received_at": self.received_at,
            "received_at_ms": self.received_at_ms,
            "device_timestamp_ms": self.device_timestamp_ms,
        }


def estimate_flame(
    temperature: float,
    gas: float,
    prev_temp: float,
    prev_gas: float,
    explicit: bool | None,
) -> bool:
    """If flame sensor missing, infer from temp/gas and rate of rise."""
    if explicit is not None:
        return explicit
    temp_rise = temperature - prev_temp
    gas_rise = gas - prev_gas
    if temperature >= 70 and gas >= 800:
        return True
    if temp_rise >= 8 and gas_rise >= 200:
        return True
    if temperature >= 85:
        return True
    return False


def gas_to_smoke(gas: float, smoke: float | None) -> float:
    if smoke is not None:
        return max(0.0, min(100.0, smoke))
    # Map typical MQ gas ADC (0–4095-ish) to smoke %
    return max(0.0, min(100.0, (gas / 40.0)))


def derive_status(score: float, flame: bool, provided: str | None) -> str:
    if provided:
        return provided.upper()
    if score >= 0.85 or flame:
        return "CRITICAL"
    if score >= 0.55:
        return "ALARM"
    if score >= 0.25:
        return "WARNING"
    return "SAFE"


class DeviceRegistry:
    """Dictionary[DeviceID, SensorState] with offline watchdog."""

    def __init__(self, offline_timeout: float = OFFLINE_TIMEOUT_S):
        self.devices: dict[str, DeviceState] = {}
        self.offline_timeout = offline_timeout
        self._listeners: list[Callable] = []
        self._watch_task: Optional[asyncio.Task] = None
        self.alerts: list[dict[str, Any]] = []

    def subscribe(self, cb: Callable):
        self._listeners.append(cb)

    def unsubscribe(self, cb: Callable):
        if cb in self._listeners:
            self._listeners.remove(cb)

    async def _emit(self, event: str, data: Any):
        payload = {"event": event, "data": data}
        for cb in list(self._listeners):
            try:
                result = cb(payload)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                pass

    def start_watchdog(self):
        if self._watch_task and not self._watch_task.done():
            return
        self._watch_task = asyncio.create_task(self._watch_loop())

    async def stop_watchdog(self):
        if self._watch_task:
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass

    async def _watch_loop(self):
        while True:
            try:
                changed = self.mark_offline()
                if changed:
                    await self._emit("devices", self.list_devices())
                await asyncio.sleep(2.0)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2.0)

    def ingest(self, payload: dict[str, Any]) -> DeviceState:
        device_id = payload["deviceId"]
        existing = self.devices.get(device_id)
        prev_temp = existing.temperature if existing else payload.get("temperature", 22.0)
        prev_gas = existing.gas if existing else payload.get("gasLevel", 0.0)

        flame = estimate_flame(
            payload["temperature"],
            payload.get("gasLevel", 0.0),
            prev_temp,
            prev_gas,
            payload.get("flame"),
        )
        smoke = gas_to_smoke(payload.get("gasLevel", 0.0), payload.get("smoke"))
        occupancy = int(payload.get("occupancy") or (existing.occupancy if existing else 0))

        reading = SensorReading(
            temperature=float(payload["temperature"]),
            smoke=smoke,
            flame=flame,
            occupancy=occupancy,
        )
        hazard = compute_hazard(reading, capacity=30)
        status = derive_status(hazard.score, flame, payload.get("status"))

        # Explicit SAFE from Wokwi/ESP32 wins — clear inferred flame/smoke so rooms recover
        if status == "SAFE":
            flame = False
            if payload.get("smoke") is None:
                smoke = min(smoke, 4.0)
            else:
                smoke = min(float(payload["smoke"]), 8.0)
            reading = SensorReading(
                temperature=float(payload["temperature"]),
                smoke=smoke,
                flame=False,
                occupancy=occupancy,
            )
            hazard = compute_hazard(reading, capacity=30)

        node_id = payload.get("nodeId")
        if not node_id and existing:
            node_id = existing.node_id

        state = DeviceState(
            device_id=device_id,
            room=payload.get("room", existing.room if existing else device_id),
            room_type=payload.get("type", existing.room_type if existing else "ROOM"),
            floor=int(payload.get("floor", existing.floor if existing else 0)),
            node_id=node_id,
            temperature=float(payload["temperature"]),
            humidity=float(payload.get("humidity", 40.0)),
            gas=float(payload.get("gasLevel", 0.0)),
            smoke=smoke,
            flame=flame,
            status=status,
            battery=float(payload.get("battery", 100.0)),
            signal=float(payload.get("signal", -55.0)),
            occupancy=occupancy,
            last_seen=time.time(),
            online=True,
            hazard=hazard.score,
            health="degraded" if hazard.score >= 0.55 else "ok",
            prev_temperature=prev_temp,
            prev_gas=prev_gas,
            mqtt_topic=f"fireexit/device/{device_id}",
        )
        was_offline = existing is not None and not existing.online
        # Keep prior retrieve timing until process_telemetry refreshes it
        if existing:
            state.retrieve_ms = existing.retrieve_ms
            state.received_at = existing.received_at
            state.received_at_ms = existing.received_at_ms
            state.device_timestamp_ms = existing.device_timestamp_ms
        self.devices[device_id] = state

        if was_offline:
            self._push_alert("INFO", "device_online", f"Device {device_id} back online", device_id)

        if status in ("ALARM", "CRITICAL") or flame:
            self._push_alert(
                "CRITICAL" if status == "CRITICAL" or flame else "WARNING",
                "fire" if flame else "high_temperature",
                f"{state.room}: {status} temp={state.temperature}°C gas={state.gas}",
                device_id,
                node_id,
            )
        elif state.gas >= 1200:
            self._push_alert(
                "WARNING",
                "gas_leak",
                f"{state.room}: elevated gas {state.gas}",
                device_id,
                node_id,
            )
        elif state.temperature >= 45:
            self._push_alert(
                "WARNING",
                "high_temperature",
                f"{state.room}: high temperature {state.temperature}°C",
                device_id,
                node_id,
            )

        state._hazard_dict = hazard_to_dict(hazard)  # type: ignore[attr-defined]
        return state

    def _push_alert(
        self,
        level: str,
        category: str,
        message: str,
        device_id: str | None = None,
        node_id: str | None = None,
    ):
        # Dedupe similar alerts within ~20s
        now = time.time()
        for a in self.alerts[:8]:
            if a.get("category") == category and a.get("device_id") == device_id:
                if now - a.get("_ts", 0) < 20:
                    return
        alert = {
            "id": str(uuid.uuid4())[:8],
            "alert_id": str(uuid.uuid4()),
            "level": level,
            "category": category,
            "message": message,
            "device_id": device_id,
            "node_id": node_id,
            "acknowledged": False,
            "timestamp": iso_ms(),
            "_ts": now,
        }
        self.alerts.insert(0, alert)
        self.alerts = self.alerts[:200]

    def mark_offline(self) -> list[str]:
        now = time.time()
        changed: list[str] = []
        for d in self.devices.values():
            if d.online and (now - d.last_seen) > self.offline_timeout:
                d.online = False
                d.health = "offline"
                changed.append(d.device_id)
                self._push_alert(
                    "WARNING",
                    "offline_device",
                    f"Device {d.device_id} offline ({d.room})",
                    d.device_id,
                    d.node_id,
                )
        return changed

    def list_devices(self) -> list[dict[str, Any]]:
        self.mark_offline()
        return [d.to_dict() for d in sorted(self.devices.values(), key=lambda x: x.device_id)]

    def get(self, device_id: str) -> Optional[dict[str, Any]]:
        self.mark_offline()
        d = self.devices.get(device_id)
        return d.to_dict() if d else None

    def resolve_node_id(self, room_name: str, floor: int, nodes: list[dict]) -> Optional[str]:
        room_l = room_name.strip().lower()
        for n in nodes:
            if n.get("name", "").strip().lower() == room_l and int(n.get("floor", 0)) == floor:
                return n["id"]
        for n in nodes:
            if n.get("name", "").strip().lower() == room_l:
                return n["id"]
        return None

    def statistics(self) -> dict[str, int]:
        self.mark_offline()
        online = sum(1 for d in self.devices.values() if d.online)
        offline = len(self.devices) - online
        return {"online_devices": online, "offline_devices": offline, "total_devices": len(self.devices)}


device_registry = DeviceRegistry()
