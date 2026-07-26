from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import get_current_user, require_role
from app.simulation.engine import simulation_manager

router = APIRouter()


class FireRequest(BaseModel):
    node_id: str
    intensity: float = Field(default=0.75, ge=0.1, le=1.0)


class SmokeRequest(BaseModel):
    node_id: str
    amount: float = Field(default=35.0, ge=1, le=100)


class ExitRequest(BaseModel):
    exit_id: str


class SpawnRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=1000)


class ExtinguishRequest(BaseModel):
    node_id: Optional[str] = None


class SensorAdjustRequest(BaseModel):
    node_id: str
    temperature: Optional[float] = Field(default=None, ge=0, le=150)
    humidity: Optional[float] = Field(default=None, ge=0, le=100)
    gas: Optional[float] = Field(default=None, ge=0, le=4095)
    smoke: Optional[float] = Field(default=None, ge=0, le=100)
    fire_intensity: Optional[float] = Field(default=None, ge=0, le=1)
    flame: Optional[bool] = None


class ConfigRequest(BaseModel):
    spread_rate: Optional[float] = Field(default=None, ge=0.01, le=0.5)
    smoke_rate: Optional[float] = Field(default=None, ge=0.01, le=0.5)
    heat_rate: Optional[float] = Field(default=None, ge=0.01, le=0.5)
    route_interval_s: Optional[float] = Field(default=None, ge=0.2, le=5.0)


@router.get("/state")
async def get_state(user: dict = Depends(get_current_user)):
    return simulation_manager.engine.snapshot()


@router.post("/start")
async def start(user: dict = Depends(require_role("admin", "operator"))):
    await simulation_manager.engine.start()
    return {"status": simulation_manager.engine.status.value}


@router.post("/pause")
async def pause(user: dict = Depends(require_role("admin", "operator"))):
    await simulation_manager.engine.pause()
    return {"status": simulation_manager.engine.status.value}


@router.post("/resume")
async def resume(user: dict = Depends(require_role("admin", "operator"))):
    await simulation_manager.engine.resume()
    return {"status": simulation_manager.engine.status.value}


@router.post("/reset")
async def reset(user: dict = Depends(require_role("admin", "operator"))):
    simulation_manager.engine.reset()
    simulation_manager.engine.spawn_people(28)
    return {"status": "idle", "snapshot": simulation_manager.engine.snapshot()}


@router.post("/fire")
async def start_fire(
    body: FireRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    ok = simulation_manager.engine.start_fire(body.node_id, body.intensity)
    if not ok:
        raise HTTPException(404, "Node not found")
    return {"ok": True, "node_id": body.node_id}


@router.post("/smoke")
async def increase_smoke(
    body: SmokeRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    simulation_manager.engine.increase_smoke(body.node_id, body.amount)
    return {"ok": True}


@router.post("/sensors")
async def adjust_sensors(
    body: SensorAdjustRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    ok = simulation_manager.engine.set_room_sensors(
        body.node_id,
        temperature=body.temperature,
        humidity=body.humidity,
        gas=body.gas,
        smoke=body.smoke,
        fire_intensity=body.fire_intensity,
        flame=body.flame,
    )
    if not ok:
        raise HTTPException(404, "Node not found")
    room = simulation_manager.engine.rooms[body.node_id]
    return {
        "ok": True,
        "node_id": body.node_id,
        "sensors": {
            "temperature": room.temperature,
            "humidity": room.humidity,
            "gas": room.gas,
            "smoke": room.smoke,
            "fire_intensity": room.fire_intensity,
            "flame": room.flame,
            "retrieve_ms": room.last_retrieve_ms,
            "received_at": room.last_received_at,
        },
    }


@router.post("/block-exit")
async def block_exit(
    body: ExitRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    ok = simulation_manager.engine.block_exit(body.exit_id)
    if not ok:
        raise HTTPException(400, "Invalid exit")
    return {"ok": True}


@router.post("/unblock-exit")
async def unblock_exit(
    body: ExitRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    simulation_manager.engine.unblock_exit(body.exit_id)
    return {"ok": True}


@router.post("/spawn")
async def spawn(
    body: SpawnRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    simulation_manager.engine.spawn_people(body.count)
    return {"ok": True, "total": len(simulation_manager.engine.people)}


@router.post("/extinguish")
async def extinguish_fire(
    body: ExtinguishRequest | None = None,
    user: dict = Depends(require_role("admin", "operator")),
):
    node_id = body.node_id if body else None
    ok = simulation_manager.engine.extinguish_fire(node_id)
    return {"ok": ok, "node_id": node_id}


@router.post("/random-fire")
async def random_fire(user: dict = Depends(require_role("admin", "operator"))):
    simulation_manager.engine.random_fire()
    return {"ok": True}


@router.post("/random-crowd")
async def random_crowd(user: dict = Depends(require_role("admin", "operator"))):
    simulation_manager.engine.spawn_people(100)
    return {"ok": True, "total": len(simulation_manager.engine.people)}


@router.post("/spawn-max")
async def spawn_max(user: dict = Depends(require_role("admin", "operator"))):
    """Fill remaining capacity up to 1000 simulated occupants."""
    from app.simulation.engine import MAX_OCCUPANTS

    eng = simulation_manager.engine
    need = MAX_OCCUPANTS - len(eng.people)
    if need > 0:
        eng.spawn_people(need)
    return {"ok": True, "total": len(eng.people), "cap": MAX_OCCUPANTS}


@router.patch("/config")
async def update_config(
    body: ConfigRequest,
    user: dict = Depends(require_role("admin", "operator")),
):
    eng = simulation_manager.engine
    if body.spread_rate is not None:
        eng.spread_rate = body.spread_rate
        eng.config["spread_rate"] = body.spread_rate
    if body.smoke_rate is not None:
        eng.smoke_rate = body.smoke_rate
        eng.config["smoke_rate"] = body.smoke_rate
    if body.heat_rate is not None:
        eng.heat_rate = body.heat_rate
        eng.config["heat_rate"] = body.heat_rate
    if body.route_interval_s is not None:
        eng.config["route_interval_s"] = body.route_interval_s
        eng._route_force = True
    return {"config": eng.config}


@router.get("/people")
async def list_people(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    return {"people": snap["people"]}


@router.post("/sensor-fail/{node_id}")
async def fail_sensor(
    node_id: str,
    user: dict = Depends(require_role("admin", "operator")),
):
    room = simulation_manager.engine.rooms.get(node_id)
    if not room:
        raise HTTPException(404, "Node not found")
    room.sensor_health = "failed"
    simulation_manager.engine._add_alert("warning", f"Sensor failure — {node_id}", node_id)
    return {"ok": True, "sensor_health": "failed"}
