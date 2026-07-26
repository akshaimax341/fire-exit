"""WebSocket hub for real-time digital twin updates."""

from __future__ import annotations

import asyncio
import json
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.simulation.engine import simulation_manager

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        data = json.dumps(message, default=str)
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def _on_sim_event(payload: dict):
    await manager.broadcast(payload)


@router.websocket("/ws/simulation")
async def simulation_ws(websocket: WebSocket):
    await manager.connect(websocket)
    simulation_manager.engine.subscribe(_on_sim_event)
    try:
        # Send initial snapshot
        await websocket.send_text(
            json.dumps(
                {
                    "event": "snapshot",
                    "data": simulation_manager.engine.snapshot(),
                    "tick": simulation_manager.engine.tick,
                },
                default=str,
            )
        )
        while True:
            # Keep alive / accept client commands
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                msg = json.loads(raw)
                cmd = msg.get("cmd")
                eng = simulation_manager.engine
                if cmd == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))
                elif cmd == "start":
                    await eng.start()
                elif cmd == "pause":
                    await eng.pause()
                elif cmd == "resume":
                    await eng.resume()
                elif cmd == "fire":
                    eng.start_fire(msg.get("node_id", ""), msg.get("intensity", 0.45))
                elif cmd == "snapshot":
                    await websocket.send_text(
                        json.dumps(
                            {"event": "snapshot", "data": eng.snapshot(), "tick": eng.tick},
                            default=str,
                        )
                    )
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"event": "heartbeat"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
    finally:
        simulation_manager.engine.unsubscribe(_on_sim_event)
