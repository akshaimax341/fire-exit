"""ESP32 / IoT telemetry + device inventory APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user, require_role
from app.db.session import get_db
from app.schemas.telemetry import DeviceCommand, TelemetryPayload
from app.services.device_registry import device_registry
from app.services.telemetry_service import process_telemetry
from app.simulation.engine import simulation_manager
from app.api.websocket import manager as ws_manager

router = APIRouter()


@router.post("/telemetry")
async def ingest_telemetry(
    body: TelemetryPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Public ESP32 ingest endpoint (no JWT — devices use deviceId).
    Validates payload, updates registry, persists, MQTT + WebSocket fan-out.
    """
    result = await process_telemetry(
        body,
        db,
        mqtt=simulation_manager.mqtt,
        broadcast=ws_manager.broadcast,
        simulation_engine=simulation_manager.engine,
    )
    return {"ok": True, "device": result}


@router.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    return {"devices": device_registry.list_devices(), **device_registry.statistics()}


@router.get("/device/{device_id}")
async def get_device(device_id: str, user: dict = Depends(get_current_user)):
    d = device_registry.get(device_id)
    if not d:
        raise HTTPException(404, "Device not found")
    return d


@router.post("/device/{device_id}/command")
async def device_command(
    device_id: str,
    body: DeviceCommand,
    user: dict = Depends(require_role("admin", "operator")),
):
    if not device_registry.get(device_id):
        raise HTTPException(404, "Device not found")
    mqtt = simulation_manager.mqtt
    if mqtt:
        mqtt.publish_command(device_id, body.command, body.payload)
    return {"ok": True, "device_id": device_id, "command": body.command}


@router.get("/rooms")
async def list_rooms(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    devices = {d["node_id"]: d for d in device_registry.list_devices() if d.get("node_id")}
    rooms = []
    for n in snap["building"]["nodes"]:
        r = snap["rooms"].get(n["id"], {})
        route = snap["routes"].get(n["id"], {})
        dev = devices.get(n["id"])
        rooms.append(
            {
                **n,
                **r,
                "recommended_exit": route.get("exit_id"),
                "travel_time": route.get("cost"),
                "device": dev,
            }
        )
    return {"rooms": rooms}


@router.get("/buildings")
async def list_buildings(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    floors = sorted({n["floor"] for n in snap["building"]["nodes"]})
    return {
        "buildings": [
            {
                "id": "default",
                "name": "FireExit Facility",
                "floors": floors,
                "node_count": len(snap["building"]["nodes"]),
                "edge_count": len(snap["building"]["edges"]),
                "layout": snap["building"],
            }
        ]
    }
