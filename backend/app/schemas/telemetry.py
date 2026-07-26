"""Enterprise IoT / telemetry Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TelemetryPayload(BaseModel):
    """ESP32 telemetry envelope (HTTP POST /api/telemetry)."""

    deviceId: str = Field(..., min_length=1, max_length=64, examples=["DEV001"])
    room: str = Field(..., min_length=1, max_length=128, examples=["Office 101"])
    type: Literal["ROOM", "CORRIDOR", "STAIRS", "EXIT", "SENSOR"] = "ROOM"
    floor: int = Field(default=0, ge=0, le=50)
    temperature: float = Field(..., ge=-40, le=200)
    humidity: float = Field(default=40.0, ge=0, le=100)
    gasLevel: float = Field(default=0.0, ge=0, le=10000)
    status: Literal["SAFE", "WARNING", "ALARM", "CRITICAL"] | None = None
    battery: float = Field(default=100.0, ge=0, le=100)
    signal: float = Field(default=-55.0, ge=-120, le=0)
    smoke: float | None = Field(default=None, ge=0, le=100)
    flame: bool | None = None
    occupancy: int | None = Field(default=None, ge=0, le=500)
    nodeId: str | None = Field(default=None, description="Optional twin node id mapping")
    timestamp: int | float | None = None


class DeviceCommand(BaseModel):
    command: Literal["reset", "ping", "led", "buzzer", "display", "firmware", "simulation"]
    payload: dict = Field(default_factory=dict)


class AlertAck(BaseModel):
    acknowledged: bool = True


class SensorStateOut(BaseModel):
    device_id: str
    room: str
    room_type: str
    floor: int
    node_id: str | None
    temperature: float
    humidity: float
    gas: float
    smoke: float
    flame: bool
    status: str
    battery: float
    signal: float
    last_seen: datetime
    online: bool
    hazard: float
    health: str
    occupancy: int = 0


class StatisticsOut(BaseModel):
    people_inside: int
    people_evacuated: int
    people_remaining: int
    avg_temperature: float
    max_temperature: float
    fire_rooms: int
    critical_rooms: int
    safe_rooms: int
    blocked_exits: int
    available_exits: int
    online_devices: int
    offline_devices: int
    system_health: str
    response_time_ms: float
    hazard_index: float
    active_alerts: int
