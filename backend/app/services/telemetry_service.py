"""Telemetry ingest orchestration — validate → registry → DB → MQTT → WS → twin."""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import epoch_ms, iso_ms, utc_now
from app.repositories.iot import AlertRepository, DeviceRepository, EventRepository, TelemetryRepository
from app.schemas.telemetry import TelemetryPayload
from app.services.device_registry import device_registry
from app.simulation.engine import simulation_manager

logger = logging.getLogger(__name__)


def _is_evacuation_hazard(state) -> bool:
    """Fire, dense smoke, extreme heat, or ALARM/CRITICAL → start exit routing."""
    if state.status == "SAFE" and not state.flame:
        return False
    if state.flame or state.status in ("ALARM", "CRITICAL"):
        return True
    if state.smoke >= 35 or state.temperature >= 55 or state.gas >= 1000:
        return True
    if state.status == "WARNING" and (
        state.smoke >= 25 or state.temperature >= 50 or state.gas >= 900
    ):
        return True
    return False


async def process_telemetry(
    payload: TelemetryPayload,
    db: AsyncSession,
    *,
    mqtt=None,
    broadcast=None,
    simulation_engine=None,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    received_at = utc_now()
    received_iso = iso_ms(received_at)
    received_ms = epoch_ms(received_at)
    data = payload.model_dump()

    # Map room name → twin node when possible
    if simulation_engine and not data.get("nodeId"):
        nodes = [
            {"id": n.id, "name": n.name, "floor": n.floor}
            for n in simulation_engine.graph.nodes.values()
        ]
        mapped = device_registry.resolve_node_id(data["room"], int(data["floor"]), nodes)
        if mapped:
            data["nodeId"] = mapped

    state = device_registry.ingest(data)
    out = state.to_dict()
    out["received_at"] = received_iso
    out["received_at_ms"] = received_ms
    # Device boot millis (ESP32 millis()) when provided
    if data.get("timestamp") is not None:
        out["device_timestamp_ms"] = int(data["timestamp"])
    hazard_dict = getattr(state, "_hazard_dict", None)

    # Persist
    try:
        await DeviceRepository(db).upsert_from_state(
            {
                **out,
                "last_seen": received_at.replace(tzinfo=None),
            }
        )
        await TelemetryRepository(db).insert(
            {
                "device_id": state.device_id,
                "node_id": state.node_id,
                "temperature": state.temperature,
                "humidity": state.humidity,
                "gas": state.gas,
                "smoke": state.smoke,
                "flame": state.flame,
                "status": state.status,
                "battery": state.battery,
                "signal": state.signal,
                "payload_json": {
                    **data,
                    "received_at": received_iso,
                    "received_at_ms": received_ms,
                },
                "recorded_at": received_at.replace(tzinfo=None),
            }
        )
        await EventRepository(db).log(
            "telemetry",
            f"{state.device_id} {state.status}",
            {
                "device_id": state.device_id,
                "status": state.status,
                "received_at": received_iso,
                "received_at_ms": received_ms,
            },
        )
        # Persist newest registry alerts
        alert_repo = AlertRepository(db)
        for a in device_registry.alerts[:3]:
            if a.get("_persisted"):
                continue
            try:
                await alert_repo.create(
                    {
                        "alert_id": a["alert_id"],
                        "level": a["level"],
                        "category": a["category"],
                        "message": a["message"],
                        "device_id": a.get("device_id"),
                        "node_id": a.get("node_id"),
                    }
                )
                a["_persisted"] = True
            except Exception:
                pass
    except Exception as e:
        logger.warning("Telemetry persist failed (continuing): %s", e)

    # Push into digital twin room state
    if simulation_engine and state.node_id:
        try:
            simulation_engine.apply_iot_telemetry(
                state.node_id,
                temperature=state.temperature,
                smoke=state.smoke,
                flame=state.flame,
                humidity=state.humidity,
                gas=state.gas,
                device_id=state.device_id,
                battery=state.battery,
                signal=state.signal,
                status=state.status,
                auto_ignite=(
                    state.status in ("ALARM", "CRITICAL", "WARNING") or state.flame
                )
                and state.status != "SAFE",
            )
        except Exception as e:
            logger.warning("Twin apply failed: %s", e)

    # Sensor hazard → simulation_manager starts exit-path evacuation
    if _is_evacuation_hazard(state):
        try:
            started = await simulation_manager.ensure_evacuation(
                reason=f"sensor {state.device_id} @ {state.room} ({state.status})"
            )
            if started:
                logger.info(
                    "Evacuation auto-started from sensor %s (smoke=%.1f temp=%.1f)",
                    state.device_id,
                    state.smoke,
                    state.temperature,
                )
        except Exception as e:
            logger.warning("Auto-evacuation start failed: %s", e)

    # MQTT
    if mqtt:
        try:
            mqtt.publish_device(state.device_id, {**out, "hazard_detail": hazard_dict})
        except Exception as e:
            logger.warning("MQTT device publish failed: %s", e)

    # WebSocket
    if broadcast:
        try:
            await broadcast(
                {
                    "event": "telemetry",
                    "data": {
                        "device": out,
                        "devices": device_registry.list_devices(),
                        "snapshot": simulation_engine.snapshot() if simulation_engine else None,
                    },
                }
            )
        except Exception as e:
            logger.warning("WS broadcast failed: %s", e)

    retrieve_ms = (time.perf_counter() - t0) * 1000.0
    out["retrieve_ms"] = round(retrieve_ms, 3)
    # Persist timing onto registry device so /api/devices + UI stay in sync
    try:
        live = device_registry.devices.get(state.device_id)
        if live:
            live.retrieve_ms = round(retrieve_ms, 3)
            live.received_at = received_iso
            live.received_at_ms = received_ms
            if data.get("timestamp") is not None:
                live.device_timestamp_ms = int(data["timestamp"])
            out = live.to_dict()
            out["retrieve_ms"] = round(retrieve_ms, 3)
            out["received_at"] = received_iso
            out["received_at_ms"] = received_ms
            if data.get("timestamp") is not None:
                out["device_timestamp_ms"] = int(data["timestamp"])
    except Exception:
        pass

    # Mirror timing onto twin room for dashboard / IoT room cards
    if simulation_engine and state.node_id:
        room = simulation_engine.rooms.get(state.node_id)
        if room:
            room.last_retrieve_ms = round(retrieve_ms, 3)
            room.last_received_at = received_iso

    logger.info(
        "telemetry retrieve device=%s status=%s received_at=%s received_at_ms=%s device_ms=%s retrieve_ms=%.3f",
        state.device_id,
        state.status,
        received_iso,
        received_ms,
        data.get("timestamp"),
        retrieve_ms,
    )

    return out
