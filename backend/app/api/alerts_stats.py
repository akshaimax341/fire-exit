"""Alerts + facility statistics APIs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user, require_role
from app.core.timeutil import iso_ms
from app.db.session import get_db
from app.repositories.iot import AlertRepository
from app.schemas.telemetry import AlertAck
from app.services.device_registry import device_registry
from app.simulation.engine import simulation_manager

router = APIRouter()


@router.get("/alerts")
async def list_alerts(
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sim_alerts = simulation_manager.engine.alerts[:limit]
    iot_alerts = device_registry.alerts[:limit]
    # Prefer DB history when available
    try:
        rows = await AlertRepository(db).list_recent(limit=limit)
        db_alerts = [
            {
                "id": r.alert_id,
                "level": r.level,
                "category": r.category,
                "message": r.message,
                "device_id": r.device_id,
                "node_id": r.node_id,
                "acknowledged": r.acknowledged,
                "timestamp": iso_ms(r.created_at) if r.created_at else iso_ms(),
            }
            for r in rows
        ]
    except Exception:
        db_alerts = []

    merged = db_alerts or (iot_alerts + sim_alerts)
    return {"alerts": merged[:limit], "count": len(merged)}


@router.post("/alerts/{alert_id}/ack")
async def acknowledge_alert(
    alert_id: str,
    body: AlertAck,
    user: dict = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    row = await AlertRepository(db).acknowledge(alert_id)
    for a in device_registry.alerts:
        if a.get("alert_id") == alert_id or a.get("id") == alert_id:
            a["acknowledged"] = True
    if not row:
        # Still ok if in-memory only
        return {"ok": True, "alert_id": alert_id, "acknowledged": body.acknowledged}
    return {"ok": True, "alert_id": alert_id, "acknowledged": True}


@router.get("/statistics")
async def statistics(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    m = snap["metrics"]
    rooms = list(snap["rooms"].values())
    critical = sum(1 for r in rooms if (r.get("hazard") or {}).get("level") == "critical")
    safe = sum(1 for r in rooms if (r.get("hazard") or {}).get("level") == "safe")
    exits = [n for n in snap["building"]["nodes"] if n["type"] == "exit"]
    blocked = len(m.get("blocked_exits") or [])
    device_stats = device_registry.statistics()
    hazard_index = 0.0
    if rooms:
        hazard_index = sum((r.get("hazard") or {}).get("score", 0) for r in rooms) / len(rooms)

    return {
        "people_inside": m.get("people_inside", 0),
        "people_evacuated": m.get("people_evacuated", 0),
        "people_remaining": m.get("people_remaining", 0),
        "avg_temperature": m.get("avg_temperature", 22),
        "max_temperature": m.get("max_temperature", 22),
        "fire_rooms": m.get("fire_rooms", 0),
        "critical_rooms": critical,
        "safe_rooms": safe,
        "blocked_exits": blocked,
        "available_exits": max(0, len(exits) - blocked),
        "online_devices": device_stats["online_devices"],
        "offline_devices": device_stats["offline_devices"],
        "system_health": m.get("system_health", "nominal"),
        "response_time_ms": m.get("pathfinding_ms", 0),
        "hazard_index": round(hazard_index, 4),
        "active_alerts": m.get("active_alerts", 0) + len(
            [a for a in device_registry.alerts if not a.get("acknowledged")]
        ),
    }
