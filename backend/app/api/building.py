from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import get_current_user, require_role
from app.simulation.building_defaults import default_layout_json
from app.simulation.engine import simulation_manager

router = APIRouter()


class LayoutPayload(BaseModel):
    name: str = "Custom Building"
    floors: int = 1
    description: str = ""
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/layout")
async def get_layout(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    return {
        "name": "Horizon Tower — Wing B",
        "floors": 2,
        "description": "Live digital twin layout",
        "nodes": snap["building"]["nodes"],
        "edges": snap["building"]["edges"],
    }


@router.get("/default-layout")
async def get_default_layout():
    return default_layout_json()


@router.put("/layout")
async def update_layout(
    payload: LayoutPayload,
    user: dict = Depends(require_role("admin", "operator")),
):
    if len(payload.nodes) < 2:
        raise HTTPException(400, "Layout requires at least 2 nodes")
    simulation_manager.engine.load_layout(payload.model_dump())
    simulation_manager.engine.spawn_people(20)
    return {"ok": True, "nodes": len(payload.nodes), "edges": len(payload.edges)}


@router.post("/reset-layout")
async def reset_layout(user: dict = Depends(require_role("admin", "operator"))):
    simulation_manager.engine.reset()
    simulation_manager.engine.spawn_people(28)
    return {"ok": True, "layout": default_layout_json()}
