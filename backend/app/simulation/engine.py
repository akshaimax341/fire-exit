"""Core real-time simulation engine — fire/smoke, crowd, multi-exit A*, collisions."""

from __future__ import annotations

import asyncio
import math
import random
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

from app.engines.hazard import SensorReading, compute_hazard, hazard_to_dict
from app.engines.pathfinding import BuildingGraph, GraphEdge, GraphNode, PathResult
from app.simulation.building_defaults import create_default_building

MAX_OCCUPANTS = 1000
ROUTE_INTERVAL_S = 1.0  # Recalculate A* every second


class SimStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"


@dataclass
class Person:
    id: str
    badge_id: str
    name: str
    role: str
    position: str
    x: float
    y: float
    floor: int
    speed: float
    status: str
    path: list[str] = field(default_factory=list)
    path_index: int = 0
    progress: float = 0.0
    heading: float = 0.0
    walk_phase: float = 0.0
    radius: float = 4.0
    wait_ticks: int = 0


@dataclass
class RoomState:
    node_id: str
    temperature: float = 22.0
    smoke: float = 0.0
    flame: bool = False
    fire_intensity: float = 0.0
    on_fire: bool = False
    sensor_health: str = "ok"
    led_color: str = "green"
    alarm: bool = False
    occupancy: int = 0
    hazard: dict[str, Any] = field(default_factory=dict)


class SimulationEngine:
    def __init__(self):
        self.status = SimStatus.IDLE
        self.tick: int = 0
        self.graph: BuildingGraph = create_default_building()
        self.rooms: dict[str, RoomState] = {}
        self.people: dict[str, Person] = {}
        self.routes: dict[str, list[str]] = {}
        self.room_routes: dict[str, PathResult] = {}
        self.history: list[dict[str, Any]] = []
        self.alerts: list[dict[str, Any]] = []
        self.spread_rate: float = 0.08
        self.smoke_rate: float = 0.18  # smoke spreads faster than flame by default
        self.heat_rate: float = 0.15
        self._listeners: list[Callable] = []
        self._task: Optional[asyncio.Task] = None
        self._last_path_ms: float = 0.0
        self._evacuated_count: int = 0
        self._start_time: Optional[float] = None
        self._last_route_time: float = 0.0
        self._route_force: bool = True
        self.config: dict[str, Any] = {
            "spread_rate": 0.08,
            "smoke_rate": 0.18,
            "heat_rate": 0.15,
            "tick_ms": 200,
            "route_interval_s": ROUTE_INTERVAL_S,
            "max_occupants": MAX_OCCUPANTS,
        }
        self._init_rooms()

    def _init_rooms(self):
        self.rooms = {}
        for nid, node in self.graph.nodes.items():
            self.rooms[nid] = RoomState(node_id=nid)

    def subscribe(self, callback: Callable):
        self._listeners.append(callback)

    def unsubscribe(self, callback: Callable):
        if callback in self._listeners:
            self._listeners.remove(callback)

    async def _broadcast(self, event: str, data: Any = None):
        payload = {"event": event, "data": data or self.snapshot(), "tick": self.tick}
        for cb in list(self._listeners):
            try:
                result = cb(payload)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                pass

    def reset(self):
        self.status = SimStatus.IDLE
        self.tick = 0
        self.graph = create_default_building()
        self._init_rooms()
        self.people.clear()
        self.routes.clear()
        self.room_routes.clear()
        self.history.clear()
        self.alerts.clear()
        self._evacuated_count = 0
        self._start_time = None
        self._last_route_time = 0.0
        self._route_force = True
        self.spread_rate = self.config["spread_rate"]
        self.smoke_rate = self.config["smoke_rate"]
        self.heat_rate = self.config["heat_rate"]

    def load_layout(self, layout: dict[str, Any]):
        g = BuildingGraph()
        for n in layout.get("nodes", []):
            g.add_node(
                GraphNode(
                    id=n["id"],
                    name=n.get("name", n["id"]),
                    node_type=n.get("type", "room"),
                    floor=n.get("floor", 0),
                    x=n.get("x", 0),
                    y=n.get("y", 0),
                    capacity=n.get("capacity", 20),
                )
            )
        for e in layout.get("edges", []):
            g.add_edge(
                GraphEdge(
                    source=e["source"],
                    target=e["target"],
                    distance=e.get("distance", 10),
                )
            )
        self.graph = g
        self._init_rooms()
        self._route_force = True

    async def start(self):
        if self.status == SimStatus.RUNNING:
            return
        if not self.people:
            self.spawn_people(48)
        self.status = SimStatus.RUNNING
        self._start_time = time.time()
        self._route_force = True
        self._add_alert("info", "Simulation started — evacuation twin online")
        await self._broadcast("status")

    async def pause(self):
        self.status = SimStatus.PAUSED
        self._add_alert("info", "Simulation paused")
        await self._broadcast("status")

    async def resume(self):
        if self.status == SimStatus.PAUSED:
            self.status = SimStatus.RUNNING
            self._route_force = True
            self._add_alert("info", "Simulation resumed")
            await self._broadcast("status")

    def spawn_people(self, count: int = 20):
        remaining = MAX_OCCUPANTS - len(self.people)
        count = max(0, min(count, remaining))
        if count <= 0:
            self._add_alert("warning", f"Occupant cap reached ({MAX_OCCUPANTS})")
            return

        rooms = [
            n
            for n in self.graph.nodes.values()
            if n.node_type in ("room", "corridor") and not self.rooms[n.id].on_fire
        ]
        if not rooms:
            return

        # Prefer rooms with spare capacity
        weighted: list[GraphNode] = []
        for n in rooms:
            spare = max(1, n.capacity - self.rooms[n.id].occupancy)
            weighted.extend([n] * min(spare, 8))
        if not weighted:
            weighted = rooms

        first_names = [
            "Aisha", "Noah", "Priya", "Liam", "Sofia", "Kai", "Maya", "Omar",
            "Elena", "Raj", "Zoe", "Chen", "Amara", "Diego", "Yuki", "Sara",
            "Ibrahim", "Nora", "Arjun", "Hana",
        ]
        lasts = ["Patel", "Chen", "Kim", "Garcia", "Singh", "Okoro", "Nguyen", "Ross", "Ali", "Park"]

        for _ in range(count):
            room = random.choice(weighted)
            pid = str(uuid.uuid4())[:8]
            role = random.choice(["employee", "employee", "student", "visitor"])
            prefix = {"employee": "EMP", "student": "STU", "visitor": "VIS"}[role]
            angle = random.uniform(0, math.tau)
            rad = random.uniform(0, 22)
            person = Person(
                id=pid,
                badge_id=f"{prefix}-{random.randint(10000, 99999)}",
                name=f"{random.choice(first_names)} {random.choice(lasts)}",
                role=role,
                position=room.id,
                x=room.x + math.cos(angle) * rad,
                y=room.y + math.sin(angle) * rad,
                floor=room.floor,
                speed=random.uniform(2.8, 5.2),
                status="safe",
                heading=angle,
                walk_phase=random.uniform(0, math.tau),
                radius=random.uniform(3.2, 4.8),
            )
            self.people[pid] = person
        self._recompute_occupancy()
        self._route_force = True

    def _recompute_occupancy(self):
        counts: dict[str, int] = {nid: 0 for nid in self.rooms}
        for p in self.people.values():
            if p.status in ("safe", "evacuating") and p.position in counts:
                counts[p.position] += 1
        for nid, c in counts.items():
            self.rooms[nid].occupancy = c
            if nid in self.graph.nodes:
                self.graph.nodes[nid].occupancy = c

    def _update_edge_flow(self):
        flow: dict[tuple[str, str], int] = defaultdict(int)
        for p in self.people.values():
            if p.status != "evacuating" or not p.path or p.path_index >= len(p.path) - 1:
                continue
            a = p.path[p.path_index]
            b = p.path[p.path_index + 1]
            flow[(a, b)] += 1
        self.graph.set_edge_flow(dict(flow))

    # ── Fire / smoke ──────────────────────────────────────────

    def start_fire(self, node_id: str, intensity: float = 0.4):
        room = self.rooms.get(node_id)
        if not room:
            return False
        room.on_fire = True
        room.flame = True
        room.fire_intensity = max(room.fire_intensity, intensity)
        room.temperature = max(room.temperature, 55.0)
        room.smoke = max(room.smoke, 30.0)
        room.alarm = True
        room.led_color = "pulsing_red"
        name = self.graph.nodes[node_id].name
        self._add_alert("critical", f"FIRE DETECTED — {name}", node_id)
        self._route_force = True
        return True

    def block_exit(self, exit_id: str):
        node = self.graph.nodes.get(exit_id)
        room = self.rooms.get(exit_id)
        if not node or node.node_type != "exit":
            return False
        node.blocked = True
        if room:
            room.hazard = {**(room.hazard or {}), "blocked": True}
        self._add_alert("danger", f"Exit blocked — {node.name}", exit_id)
        self._route_force = True
        return True

    def unblock_exit(self, exit_id: str):
        node = self.graph.nodes.get(exit_id)
        if not node:
            return False
        node.blocked = False
        self._route_force = True
        return True

    def increase_smoke(self, node_id: str, amount: float = 20.0):
        room = self.rooms.get(node_id)
        if not room:
            return
        room.smoke = min(100.0, room.smoke + amount)
        self._route_force = True

    def extinguish_fire(self, node_id: str | None = None):
        """Clear fire on one room or all rooms."""
        targets = [node_id] if node_id else list(self.rooms.keys())
        cleared = 0
        for nid in targets:
            room = self.rooms.get(nid)
            if not room or not room.on_fire:
                continue
            room.on_fire = False
            room.flame = False
            room.fire_intensity = 0.0
            room.temperature = max(28.0, room.temperature * 0.55)
            room.smoke = max(0.0, room.smoke * 0.4)
            room.alarm = room.smoke > 35
            cleared += 1
        if cleared:
            if node_id and node_id in self.graph.nodes:
                name = self.graph.nodes[node_id].name
            else:
                name = "all zones"
            self._add_alert("info", f"Fire extinguished — {name}", node_id)
            self._route_force = True
        return cleared > 0

    def random_fire(self):
        candidates = [
            nid
            for nid, n in self.graph.nodes.items()
            if n.node_type == "room" and not self.rooms[nid].on_fire
        ]
        if candidates:
            self.start_fire(random.choice(candidates), intensity=0.5)

    def _spread_fire_and_smoke(self):
        """
        Adjacent-room fire spread + faster smoke diffusion.
        Smoke propagates through adjacency every tick; flames ignite slower.
        """
        heat_updates: dict[str, float] = defaultdict(float)
        smoke_updates: dict[str, float] = defaultdict(float)
        ignite: set[str] = set()

        for nid, room in self.rooms.items():
            neighbors = self.graph.adjacency.get(nid, [])

            if room.on_fire:
                room.fire_intensity = min(1.0, room.fire_intensity + self.heat_rate * 0.12)
                room.temperature = min(
                    120.0,
                    room.temperature + self.heat_rate * (7 + room.fire_intensity * 14),
                )
                room.smoke = min(
                    100.0,
                    room.smoke + self.smoke_rate * (8 + room.fire_intensity * 12),
                )
                room.flame = room.fire_intensity > 0.22
                room.alarm = True

                for neighbor, dist in neighbors:
                    nroom = self.rooms[neighbor]
                    prox = 1.0 / max(1.0, dist / 10.0)

                    # Smoke: spreads faster / farther than flame
                    smoke_push = (
                        room.smoke
                        * self.smoke_rate
                        * prox
                        * (0.22 + room.fire_intensity * 0.35)
                    )
                    smoke_updates[neighbor] += smoke_push

                    # Heat / flame: slower adjacent ignition
                    if not nroom.on_fire:
                        heat_push = (
                            room.temperature
                            * self.spread_rate
                            * prox
                            * room.fire_intensity
                            * 0.055
                        )
                        heat_updates[neighbor] += heat_push
                        ignite_chance = (
                            self.spread_rate * prox * room.fire_intensity * 0.22
                        )
                        if room.fire_intensity > 0.5 and random.random() < ignite_chance:
                            ignite.add(neighbor)

            # Smoke-only rooms also diffuse to neighbors (pre-fire plume)
            elif room.smoke > 8:
                for neighbor, dist in neighbors:
                    prox = 1.0 / max(1.0, dist / 10.0)
                    smoke_updates[neighbor] += room.smoke * self.smoke_rate * prox * 0.14

            else:
                if room.temperature > 22:
                    room.temperature = max(22.0, room.temperature - 0.06)
                burning_near = any(self.rooms[n].on_fire for n, _ in neighbors)
                if room.smoke > 0 and not burning_near:
                    room.smoke = max(0.0, room.smoke - 0.12)

        for nid, heat in heat_updates.items():
            room = self.rooms[nid]
            room.temperature = min(120.0, room.temperature + heat)

        for nid, smoke in smoke_updates.items():
            room = self.rooms[nid]
            room.smoke = min(100.0, room.smoke + smoke)

        for nid in ignite:
            room = self.rooms[nid]
            if room.on_fire:
                continue
            if room.temperature > 46 or room.smoke > 55:
                room.on_fire = True
                room.flame = True
                room.fire_intensity = 0.28
                room.alarm = True
                room.temperature = max(room.temperature, 52.0)
                name = self.graph.nodes[nid].name
                self._add_alert("critical", f"Fire spread to {name}", nid)
                self._route_force = True

    def _update_sensors_and_hazard(self):
        for nid, room in self.rooms.items():
            if room.sensor_health == "failed":
                reading = SensorReading(45.0, 30.0, False, room.occupancy)
            else:
                jitter_t = random.uniform(-0.35, 0.35) if not room.on_fire else random.uniform(-1, 1)
                jitter_s = random.uniform(-0.25, 0.25)
                reading = SensorReading(
                    temperature=max(18.0, room.temperature + jitter_t),
                    smoke=max(0.0, min(100.0, room.smoke + jitter_s)),
                    flame=room.flame,
                    occupancy=room.occupancy,
                )
                room.temperature = reading.temperature
                room.smoke = reading.smoke

            node = self.graph.nodes[nid]
            result = compute_hazard(reading, capacity=node.capacity)
            room.hazard = hazard_to_dict(result)

            if node.node_type == "exit" and node.blocked:
                pass
            elif node.node_type != "exit":
                node.blocked = result.blocked

            self.graph.update_hazard(nid, result.score, node.blocked, room.occupancy)

            if result.level.value == "critical" or room.on_fire:
                room.led_color = "pulsing_red"
            elif result.level.value == "danger":
                room.led_color = "red"
            elif result.level.value == "warning":
                room.led_color = "yellow"
            else:
                room.led_color = "green"

    # ── A* every ~1s ──────────────────────────────────────────

    def _update_routes(self, force: bool = False):
        now = time.time()
        interval = float(self.config.get("route_interval_s", ROUTE_INTERVAL_S))
        if not force and not self._route_force and (now - self._last_route_time) < interval:
            return

        self._last_route_time = now
        self._route_force = False
        self._update_edge_flow()

        t0 = time.perf_counter()
        # Exact route for every room (multi-exit A*)
        self.room_routes = self.graph.routes_for_all_rooms()
        self._last_path_ms = (time.perf_counter() - t0) * 1000

        any_fire = any(r.on_fire or r.smoke > 20 for r in self.rooms.values())
        for person in self.people.values():
            if person.status in ("evacuated", "trapped"):
                continue

            route = self.room_routes.get(person.position)
            if route and route.found:
                if any_fire or person.status == "evacuating":
                    new_path = route.path
                    # Preserve progress when prefix matches
                    if person.path != new_path:
                        if (
                            person.path
                            and len(person.path) > person.path_index
                            and new_path
                            and person.path[person.path_index] in new_path
                        ):
                            idx = new_path.index(person.path[person.path_index])
                            person.path = new_path
                            person.path_index = idx
                            # keep progress along current edge
                        else:
                            person.path = new_path
                            person.path_index = 0
                            person.progress = 0.0
                        if len(new_path) > 1:
                            person.status = "evacuating"
                    self.routes[person.id] = person.path
            else:
                if any_fire:
                    person.status = "trapped"
                    self._add_alert(
                        "danger",
                        f"{person.name} trapped — no safe exit",
                        person.position,
                    )

    # ── Crowd motion + collisions ─────────────────────────────

    def _separate_collisions(self):
        """Soft collision avoidance within the same node / nearby agents."""
        by_node: dict[str, list[Person]] = defaultdict(list)
        for p in self.people.values():
            if p.status in ("safe", "evacuating"):
                by_node[p.position].append(p)

        for group in by_node.values():
            n = len(group)
            if n < 2:
                continue
            # Cap pairwise work for large rooms
            sample = group if n <= 40 else random.sample(group, 40)
            for i, a in enumerate(sample):
                for b in sample[i + 1 :]:
                    dx = a.x - b.x
                    dy = a.y - b.y
                    dist = math.hypot(dx, dy) or 0.01
                    min_dist = a.radius + b.radius
                    if dist < min_dist:
                        push = (min_dist - dist) * 0.45
                        nx, ny = dx / dist, dy / dist
                        a.x += nx * push
                        a.y += ny * push
                        b.x -= nx * push
                        b.y -= ny * push

    def _move_people(self):
        dt = self.config.get("tick_ms", 200) / 1000.0

        for person in self.people.values():
            if person.status != "evacuating":
                continue
            if person.wait_ticks > 0:
                person.wait_ticks -= 1
                person.walk_phase += dt * 2.0
                continue

            if not person.path or person.path_index >= len(person.path) - 1:
                last = person.path[-1] if person.path else person.position
                node = self.graph.nodes.get(last)
                if node and node.node_type == "exit" and not node.blocked:
                    person.status = "evacuated"
                    person.position = last
                    self._evacuated_count += 1
                continue

            current = person.path[person.path_index]
            nxt = person.path[person.path_index + 1]
            cnode = self.graph.nodes[current]
            nnode = self.graph.nodes[nxt]

            if nnode.blocked and nnode.node_type != "exit":
                person.path = []
                self._route_force = True
                continue

            # Capacity gate — prevent overfilling destination (collision/congestion)
            dest_fill = self.rooms[nxt].occupancy / max(1, nnode.capacity)
            if dest_fill >= 1.05 and nnode.node_type != "exit":
                person.wait_ticks = random.randint(1, 3)
                continue

            dist = math.hypot(nnode.x - cnode.x, nnode.y - cnode.y) or 1.0
            congestion = dest_fill
            edge_busy = self.graph.edge_flow.get((current, nxt), 0)
            speed = person.speed * (1.0 - 0.55 * min(1.0, congestion)) * (
                1.0 - 0.04 * min(12, edge_busy)
            )
            speed = max(0.6, speed)

            step = (speed * (dt / 0.2)) / dist  # normalize to prior 200ms units
            person.progress += step

            # Heading toward next node with slight sway
            target_heading = math.atan2(nnode.y - cnode.y, nnode.x - cnode.x)
            person.heading += (target_heading - person.heading) * 0.35
            person.walk_phase += speed * dt * 3.5

            if person.progress >= 1.0:
                person.progress = 0.0
                person.path_index += 1
                person.position = nxt
                # Natural arrival offset inside room footprint
                ang = person.heading + random.uniform(-0.6, 0.6)
                person.x = nnode.x + math.cos(ang) * random.uniform(2, 10)
                person.y = nnode.y + math.sin(ang) * random.uniform(2, 10)
                person.floor = nnode.floor
                if nnode.node_type == "exit" and not nnode.blocked:
                    person.status = "evacuated"
                    self._evacuated_count += 1
            else:
                t = person.progress
                # Ease-in-out for natural gait
                ease = t * t * (3 - 2 * t)
                sway = math.sin(person.walk_phase) * 2.2
                px = cnode.x + (nnode.x - cnode.x) * ease
                py = cnode.y + (nnode.y - cnode.y) * ease
                # Perpendicular sway
                person.x = px + math.cos(person.heading + math.pi / 2) * sway
                person.y = py + math.sin(person.heading + math.pi / 2) * sway

        self._separate_collisions()
        self._recompute_occupancy()

    def _add_alert(self, level: str, message: str, node_id: str | None = None):
        self.alerts.insert(
            0,
            {
                "id": str(uuid.uuid4())[:8],
                "level": level,
                "message": message,
                "node_id": node_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
        self.alerts = self.alerts[:50]

    def _record_history(self):
        temps = [r.temperature for r in self.rooms.values()]
        smokes = [r.smoke for r in self.rooms.values()]
        inside = sum(1 for p in self.people.values() if p.status in ("safe", "evacuating", "trapped"))
        evacuated = sum(1 for p in self.people.values() if p.status == "evacuated")
        fire_rooms = sum(1 for r in self.rooms.values() if r.on_fire)
        self.history.append(
            {
                "tick": self.tick,
                "t": time.time(),
                "avg_temp": round(sum(temps) / max(1, len(temps)), 2),
                "avg_smoke": round(sum(smokes) / max(1, len(smokes)), 2),
                "max_temp": round(max(temps) if temps else 0, 2),
                "max_smoke": round(max(smokes) if smokes else 0, 2),
                "people_inside": inside,
                "evacuated": evacuated,
                "fire_rooms": fire_rooms,
                "path_ms": round(self._last_path_ms, 2),
            }
        )
        if len(self.history) > 300:
            self.history = self.history[-300:]

    async def tick_once(self):
        if self.status != SimStatus.RUNNING:
            return
        self.tick += 1
        self._spread_fire_and_smoke()
        self._update_sensors_and_hazard()
        self._update_routes(force=False)
        self._move_people()
        if self.tick % 2 == 0:
            self._record_history()
        await self._broadcast("tick")

    def snapshot(self) -> dict[str, Any]:
        people_inside = sum(
            1 for p in self.people.values() if p.status in ("safe", "evacuating", "trapped")
        )
        evacuated = sum(1 for p in self.people.values() if p.status == "evacuated")
        trapped = sum(1 for p in self.people.values() if p.status == "trapped")
        temps = [r.temperature for r in self.rooms.values()]
        smokes = [r.smoke for r in self.rooms.values()]
        fire_rooms = [nid for nid, r in self.rooms.items() if r.on_fire]
        blocked_exits = [
            nid for nid, n in self.graph.nodes.items() if n.node_type == "exit" and n.blocked
        ]
        blocked_corridors = [
            nid for nid, n in self.graph.nodes.items() if n.node_type == "corridor" and n.blocked
        ]
        sensor_ok = sum(1 for r in self.rooms.values() if r.sensor_health == "ok")
        sensor_total = len(self.rooms)

        room_routes_out = {}
        for rid, pr in self.room_routes.items():
            room_routes_out[rid] = {
                "path": pr.path,
                "cost": round(pr.cost, 2) if pr.found else None,
                "exit_id": pr.exit_id,
                "found": pr.found,
                "latency_ms": round(pr.latency_ms, 2),
            }

        return {
            "status": self.status.value,
            "tick": self.tick,
            "elapsed_s": round(time.time() - self._start_time, 1) if self._start_time else 0,
            "config": {
                "spread_rate": self.spread_rate,
                "smoke_rate": self.smoke_rate,
                "heat_rate": self.heat_rate,
                "route_interval_s": self.config.get("route_interval_s", ROUTE_INTERVAL_S),
                "max_occupants": MAX_OCCUPANTS,
            },
            "building": self.graph.to_dict(),
            "rooms": {
                nid: {
                    "node_id": r.node_id,
                    "temperature": round(r.temperature, 1),
                    "smoke": round(r.smoke, 1),
                    "flame": r.flame,
                    "fire_intensity": round(r.fire_intensity, 3),
                    "on_fire": r.on_fire,
                    "sensor_health": r.sensor_health,
                    "led_color": r.led_color,
                    "alarm": r.alarm,
                    "occupancy": r.occupancy,
                    "hazard": r.hazard,
                }
                for nid, r in self.rooms.items()
            },
            "people": [
                {
                    "id": p.id,
                    "badge_id": p.badge_id,
                    "name": p.name,
                    "role": p.role,
                    "position": p.position,
                    "x": round(p.x, 1),
                    "y": round(p.y, 1),
                    "floor": p.floor,
                    "speed": round(p.speed, 2),
                    "status": p.status,
                    "path": p.path,
                    "heading": round(p.heading, 3),
                    "walk_phase": round(p.walk_phase, 2),
                }
                for p in self.people.values()
            ],
            "routes": room_routes_out,
            "alerts": self.alerts[:20],
            "history": self.history[-60:],
            "metrics": {
                "people_inside": people_inside,
                "people_evacuated": evacuated,
                "people_remaining": people_inside,
                "people_trapped": trapped,
                "total_people": len(self.people),
                "avg_temperature": round(sum(temps) / max(1, len(temps)), 1),
                "avg_smoke": round(sum(smokes) / max(1, len(smokes)), 1),
                "max_temperature": round(max(temps) if temps else 0, 1),
                "max_smoke": round(max(smokes) if smokes else 0, 1),
                "fire_rooms": len(fire_rooms),
                "fire_room_ids": fire_rooms,
                "blocked_exits": blocked_exits,
                "blocked_corridors": blocked_corridors,
                "sensor_health_pct": round(100 * sensor_ok / max(1, sensor_total), 1),
                "pathfinding_ms": round(self._last_path_ms, 2),
                "active_alerts": len(
                    [a for a in self.alerts if a["level"] in ("critical", "danger")]
                ),
                "system_health": "degraded" if fire_rooms else "nominal",
            },
        }


class SimulationManager:
    def __init__(self):
        self.engine = SimulationEngine()
        self._loop_task: Optional[asyncio.Task] = None
        self._mqtt = None
        self.status = "initializing"

    async def initialize(self):
        self.engine.spawn_people(40)
        self.status = "ready"
        self._loop_task = asyncio.create_task(self._loop())

    async def shutdown(self):
        self.status = "shutdown"
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while True:
            try:
                if self.engine.status == SimStatus.RUNNING:
                    await self.engine.tick_once()
                await asyncio.sleep(self.engine.config.get("tick_ms", 200) / 1000.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.engine._add_alert("danger", f"Engine fault: {e}")
                await asyncio.sleep(1.0)


simulation_manager = SimulationManager()
