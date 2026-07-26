from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.simulation.engine import simulation_manager

router = APIRouter()


@router.get("/overview")
async def overview(user: dict = Depends(get_current_user)):
    snap = simulation_manager.engine.snapshot()
    return {
        "metrics": snap["metrics"],
        "history": snap["history"],
        "alerts": snap["alerts"],
        "pathfinding_ms": snap["metrics"]["pathfinding_ms"],
    }


@router.get("/timeseries")
async def timeseries(user: dict = Depends(get_current_user)):
    hist = simulation_manager.engine.history
    return {
        "temperature": [{"t": h["tick"], "v": h["avg_temp"], "max": h["max_temp"]} for h in hist],
        "smoke": [{"t": h["tick"], "v": h["avg_smoke"], "max": h["max_smoke"]} for h in hist],
        "evacuated": [{"t": h["tick"], "v": h["evacuated"]} for h in hist],
        "occupancy": [{"t": h["tick"], "v": h["people_inside"]} for h in hist],
        "pathfinding": [{"t": h["tick"], "v": h["path_ms"]} for h in hist],
    }


@router.get("/heatmap")
async def heatmap(user: dict = Depends(get_current_user)):
    eng = simulation_manager.engine
    cells = []
    for nid, room in eng.rooms.items():
        node = eng.graph.nodes[nid]
        cells.append(
            {
                "id": nid,
                "name": node.name,
                "x": node.x,
                "y": node.y,
                "floor": node.floor,
                "score": room.hazard.get("score", 0) if room.hazard else 0,
                "level": room.hazard.get("level", "safe") if room.hazard else "safe",
                "temperature": room.temperature,
                "smoke": room.smoke,
            }
        )
    return {"cells": cells}


@router.get("/exit-utilization")
async def exit_utilization(user: dict = Depends(get_current_user)):
    eng = simulation_manager.engine
    exits = {nid: 0 for nid, n in eng.graph.nodes.items() if n.node_type == "exit"}
    for p in eng.people.values():
        if p.status == "evacuated" and p.position in exits:
            exits[p.position] += 1
        elif p.path and p.path[-1] in exits and p.status == "evacuating":
            exits[p.path[-1]] += 1
    return {
        "exits": [
            {
                "id": eid,
                "name": eng.graph.nodes[eid].name,
                "count": count,
                "blocked": eng.graph.nodes[eid].blocked,
            }
            for eid, count in exits.items()
        ]
    }
