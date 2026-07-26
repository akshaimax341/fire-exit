"""Telemetry ingest orchestration — validate → registry → DB → MQTT → WS → twin."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.iot import AlertRepository, DeviceRepository, EventRepository, TelemetryRepository
from app.schemas.telemetry import TelemetryPayload
from app.services.device_registry import device_registry

logger = logging.getLogger(__name__)


async def process_telemetry(
    payload: TelemetryPayload,
    db: AsyncSession,
    *,
    mqtt=None,
    broadcast=None,
    simulation_engine=None,
) -> dict[str, Any]:
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
    hazard_dict = getattr(state, "_hazard_dict", None)

    # Persist
    try:
        await DeviceRepository(db).upsert_from_state(
            {
                **out,
                "last_seen": datetime.utcnow(),
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
                "payload_json": data,
                "recorded_at": datetime.utcnow(),
            }
        )
        await EventRepository(db).log(
            "telemetry",
            f"{state.device_id} {state.status}",
            {"device_id": state.device_id, "status": state.status},
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
                auto_ignite=state.status in ("ALARM", "CRITICAL") or state.flame,
            )
        except Exception as e:
            logger.warning("Twin apply failed: %s", e)

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

    return out
