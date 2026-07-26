"""Core real-time simulation engine — fire/smoke, crowd, multi-exit A*, collisions."""

from __future__ import annotations

import asyncio
import logging
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
from app.core.timeutil import iso_ms

MAX_OCCUPANTS = 1000
ROUTE_INTERVAL_S = 1.0  # Recalculate A* every second

# Room considered safe / normal again below these readings
SAFE_TEMP_C = 32.0
SAFE_SMOKE_PCT = 12.0
NORMAL_TEMP_C = 22.0


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
    humidity: float = 40.0
    gas: float = 0.0
    device_id: Optional[str] = None
    battery: float = 100.0
    signal: float = -55.0
    last_iot_update: Optional[float] = None
    iot_locked: bool = False  # when True, live ESP32 owns temp/smoke briefly
    last_retrieve_ms: Optional[float] = None
    last_received_at: Optional[str] = None


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
        self.spread_rate: float = 0.14
        self.smoke_rate: float = 0.32  # faster smoke build in burning room
        self.heat_rate: float = 0.28  # stronger fire intensity / heat growth
        self._listeners: list[Callable] = []
        self._task: Optional[asyncio.Task] = None
        self._last_path_ms: float = 0.0
        self._evacuated_count: int = 0
        self._start_time: Optional[float] = None
        self._last_route_time: float = 0.0
        self._route_force: bool = True
        self.config: dict[str, Any] = {
            "spread_rate": 0.14,
            "smoke_rate": 0.32,
            "heat_rate": 0.28,
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

    def start_fire(self, node_id: str, intensity: float = 0.65):
        room = self.rooms.get(node_id)
        if not room:
            return False
        room.on_fire = True
        room.flame = True
        room.fire_intensity = max(room.fire_intensity, intensity)
        room.temperature = max(room.temperature, 62.0)
        room.smoke = max(room.smoke, 40.0)
        # Simulated sensor suite at ignition (DHT22 + gas ADC-like)
        room.humidity = max(15.0, room.humidity - 8.0)
        room.gas = max(room.gas, 1400.0 + intensity * 1200.0)
        room.alarm = True
        room.led_color = "pulsing_red"
        name = self.graph.nodes[node_id].name
        self._add_alert("critical", f"FIRE DETECTED — {name}", node_id)
        self._route_force = True
        return True

    def apply_iot_telemetry(
        self,
        node_id: str,
        *,
        temperature: float,
        smoke: float,
        flame: bool,
        humidity: float = 40.0,
        gas: float = 0.0,
        device_id: str | None = None,
        battery: float = 100.0,
        signal: float = -55.0,
        auto_ignite: bool = False,
        status: str | None = None,
    ) -> bool:
        """Blend live ESP32 reading into twin room state."""
        room = self.rooms.get(node_id)
        if not room:
            return False

        status_u = (status or "").upper()
        # Device-reported SAFE always clears the twin room (Wokwi / ESP32)
        if status_u == "SAFE":
            flame = False
            auto_ignite = False
            smoke = min(float(smoke), 5.0)
            temperature = min(float(temperature), SAFE_TEMP_C - 1.0)

        room.temperature = float(temperature)
        room.smoke = float(smoke)
        room.humidity = float(humidity)
        room.gas = float(gas)
        room.device_id = device_id
        room.battery = battery
        room.signal = signal
        room.sensor_health = "ok"
        room.last_iot_update = time.time()
        room.iot_locked = True

        # Safe / low readings → clear fire and return room to normal
        if status_u == "SAFE" or (
            not flame
            and temperature < SAFE_TEMP_C
            and smoke < SAFE_SMOKE_PCT
            and gas < 600
        ):
            was = room.on_fire or room.alarm
            self._restore_room_safe(room, announce=was)
            # Force green + clear immediately for UI
            room.on_fire = False
            room.flame = False
            room.fire_intensity = 0.0
            room.alarm = False
            room.led_color = "green"
            room.smoke = min(room.smoke, 5.0)
            room.temperature = min(room.temperature, NORMAL_TEMP_C + 1.0)
            node = self.graph.nodes.get(node_id)
            if node and node.node_type != "exit":
                node.blocked = False
            safe_reading = SensorReading(
                temperature=room.temperature,
                smoke=room.smoke,
                flame=False,
                occupancy=room.occupancy,
            )
            result = compute_hazard(safe_reading, capacity=node.capacity if node else 30)
            room.hazard = hazard_to_dict(result)
            self.graph.update_hazard(node_id, result.score, False, room.occupancy)
            self._route_force = True
            if not self._building_has_active_fire():
                self._release_trapped_people()
                self._return_people_to_safe()
            return True

        # Activate room alarm on elevated smoke even before full ignition
        if smoke >= 25 or temperature >= 45 or flame:
            room.alarm = True
            if smoke >= 25 and not flame and not room.on_fire:
                room.led_color = "yellow" if smoke < 40 else "red"
        if flame or auto_ignite:
            room.flame = True
            if not room.on_fire and (flame or temperature >= 55 or smoke >= 35):
                self.start_fire(node_id, intensity=0.42)
            else:
                room.on_fire = True
                room.fire_intensity = max(room.fire_intensity, 0.35)
                room.alarm = True
                room.led_color = "pulsing_red"
        elif smoke >= 40 or temperature >= 60:
            # Dense smoke / extreme heat without optical flame → treat as fire for routing
            if not room.on_fire:
                self.start_fire(node_id, intensity=0.38)
        self._route_force = True
        return True

    def _restore_room_safe(self, room: RoomState, *, announce: bool = False) -> bool:
        """Return a room to normal SAFE state (temp/smoke/LED/alarm)."""
        was_hazard = room.on_fire or room.flame or room.alarm or room.smoke > SAFE_SMOKE_PCT
        room.on_fire = False
        room.flame = False
        room.fire_intensity = 0.0
        room.alarm = False
        room.led_color = "green"
        room.temperature = min(room.temperature, NORMAL_TEMP_C + 2.0)
        if room.temperature > NORMAL_TEMP_C:
            room.temperature = max(NORMAL_TEMP_C, room.temperature - 1.5)
        room.smoke = max(0.0, min(room.smoke, SAFE_SMOKE_PCT * 0.5))
        if room.smoke > 0:
            room.smoke = max(0.0, room.smoke * 0.7)
        if announce and was_hazard and room.node_id in self.graph.nodes:
            name = self.graph.nodes[room.node_id].name
            self._add_alert("info", f"Room SAFE — {name} returned to normal", room.node_id)
        return was_hazard

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

    def set_room_sensors(
        self,
        node_id: str,
        *,
        temperature: float | None = None,
        humidity: float | None = None,
        gas: float | None = None,
        smoke: float | None = None,
        fire_intensity: float | None = None,
        flame: bool | None = None,
    ) -> bool:
        """Manual sensor adjustment for a room (simulation / demo controls)."""
        room = self.rooms.get(node_id)
        if not room:
            return False
        if temperature is not None:
            room.temperature = max(0.0, min(150.0, float(temperature)))
        if humidity is not None:
            room.humidity = max(0.0, min(100.0, float(humidity)))
        if gas is not None:
            room.gas = max(0.0, min(4095.0, float(gas)))
        if smoke is not None:
            room.smoke = max(0.0, min(100.0, float(smoke)))
        if fire_intensity is not None:
            room.fire_intensity = max(0.0, min(1.0, float(fire_intensity)))
            if room.fire_intensity >= 0.2:
                room.on_fire = True
                room.flame = True
                room.alarm = True
                room.led_color = "pulsing_red"
            elif room.fire_intensity <= 0.05:
                room.on_fire = False
                room.flame = False
        if flame is not None:
            room.flame = bool(flame)
            if flame:
                room.alarm = True
        room.iot_locked = False
        room.last_iot_update = time.time()
        room.last_retrieve_ms = 0.0  # local adjustment
        from app.core.timeutil import iso_ms

        room.last_received_at = iso_ms()
        self._route_force = True
        return True

    def extinguish_fire(self, node_id: str | None = None):
        """Clear fire on one room or all rooms and begin cool-down to SAFE."""
        targets = [node_id] if node_id else list(self.rooms.keys())
        cleared = 0
        for nid in targets:
            room = self.rooms.get(nid)
            if not room or not (room.on_fire or room.flame or room.fire_intensity > 0):
                continue
            room.on_fire = False
            room.flame = False
            room.fire_intensity = 0.0
            room.temperature = NORMAL_TEMP_C + 2.0
            room.smoke = 0.0
            room.alarm = False
            room.led_color = "green"
            cleared += 1
        if cleared:
            if node_id and node_id in self.graph.nodes:
                name = self.graph.nodes[node_id].name
            else:
                name = "all zones"
            self._add_alert("info", f"Fire extinguished — {name}", node_id)
            self._route_force = True
            # Free trapped/red people immediately so they can move again
            self._release_trapped_people()
        return cleared > 0

    def random_fire(self):
        candidates = [
            nid
            for nid, n in self.graph.nodes.items()
            if n.node_type == "room" and not self.rooms[nid].on_fire
        ]
        if candidates:
            self.start_fire(random.choice(candidates), intensity=0.75)

    def _building_has_active_fire(self) -> bool:
        return any(r.on_fire or r.flame for r in self.rooms.values())

    def _building_has_hazard(self) -> bool:
        return any(
            r.on_fire or r.flame or r.smoke > SAFE_SMOKE_PCT
            for r in self.rooms.values()
        )

    def _release_trapped_people(self) -> int:
        """Untrap red occupants and give them exit routes (or mark SAFE if building is clear)."""
        self.room_routes = self.graph.routes_for_all_rooms()
        released = 0
        clear = not self._building_has_hazard()
        for person in self.people.values():
            if person.status != "trapped":
                continue
            route = self.room_routes.get(person.position)
            if clear:
                person.status = "safe"
                person.path = []
                person.path_index = 0
                person.progress = 0.0
                person.wait_ticks = 0
                node = self.graph.nodes.get(person.position)
                if node:
                    person.x = node.x + random.uniform(-0.35, 0.35)
                    person.y = node.y + random.uniform(-0.35, 0.35)
                self.routes.pop(person.id, None)
                released += 1
            elif route and route.found and len(route.path) > 1:
                person.status = "evacuating"
                person.path = route.path
                person.path_index = 0
                person.progress = 0.0
                person.wait_ticks = 0
                self.routes[person.id] = person.path
                released += 1
        if released:
            self._recompute_occupancy()
            self._route_force = True
            self._add_alert("info", f"Released {released} trapped occupants — resuming movement")
        return released

    def _spread_fire_and_smoke(self):
        """
        Containment mode: only burning rooms intensify (stronger growth).
        Also drives simulated DHT22 / gas / humidity curves for the twin.
        """
        for nid, room in self.rooms.items():
            if room.on_fire:
                # Stronger intensity ramp toward flashover
                room.fire_intensity = min(
                    1.0,
                    room.fire_intensity + self.heat_rate * (0.22 + room.fire_intensity * 0.18),
                )
                room.temperature = min(
                    140.0,
                    room.temperature
                    + self.heat_rate * (12 + room.fire_intensity * 22),
                )
                room.smoke = min(
                    100.0,
                    room.smoke + self.smoke_rate * (12 + room.fire_intensity * 18),
                )
                room.flame = room.fire_intensity > 0.18
                room.alarm = True
                room.led_color = "pulsing_red"
                self._simulate_sensors_for_room(room)
                continue

            # Faster cool-down toward normal when not on fire
            if room.temperature > NORMAL_TEMP_C:
                rate = 0.55 if room.temperature < SAFE_TEMP_C else 0.28
                room.temperature = max(NORMAL_TEMP_C, room.temperature - rate)
            if room.smoke > 0 and not room.iot_locked:
                room.smoke = max(0.0, room.smoke - 0.85)
            elif room.smoke > 0 and room.iot_locked:
                if room.last_iot_update and (time.time() - room.last_iot_update) > 8.0:
                    room.iot_locked = False

            # Decay simulated gas / humidity back toward ambient when safe
            if not room.iot_locked:
                if room.gas > 180:
                    room.gas = max(120.0, room.gas - 45.0)
                if room.humidity < 40:
                    room.humidity = min(42.0, room.humidity + 0.35)
                elif room.humidity > 45:
                    room.humidity = max(40.0, room.humidity - 0.25)

            if (
                room.temperature < SAFE_TEMP_C
                and room.smoke < SAFE_SMOKE_PCT
                and not room.flame
            ):
                if room.alarm or room.fire_intensity > 0 or room.led_color != "green":
                    self._restore_room_safe(room, announce=False)
                room.led_color = "green"
                room.alarm = False
                room.fire_intensity = 0.0
                room.flame = False

    def _simulate_sensors_for_room(self, room: RoomState):
        """
        Virtual Wokwi-like sensors for rooms without live ESP32 lock:
        DHT22 (temp already on room), humidity drop, MQ gas ADC rise with intensity.
        """
        if room.iot_locked and room.last_iot_update and (time.time() - room.last_iot_update) < 6.0:
            # Live device owns the channel briefly — still nudge gas if missing
            if room.gas < 200 and room.on_fire:
                room.gas = max(room.gas, 800.0)
            return

        fi = room.fire_intensity
        # Humidity falls as heat rises (DHT22-like)
        room.humidity = max(8.0, 42.0 - fi * 28.0 + random.uniform(-1.5, 1.5))
        # Gas sensor ADC-ish (0–4095): ambient ~150 → flashover ~3200+
        target_gas = 180.0 + fi * 2800.0 + room.smoke * 12.0
        room.gas = min(4095.0, room.gas * 0.7 + target_gas * 0.3 + random.uniform(-40, 40))
        # Battery / RSSI wobble for SCADA realism
        if room.device_id is None:
            room.device_id = f"SIM-{room.node_id}"
        room.battery = max(40.0, min(100.0, room.battery - random.uniform(0, 0.02)))
        room.signal = max(-90.0, min(-40.0, -55.0 + random.uniform(-8, 8)))

    def _return_people_to_safe(self):
        """When building is clear, stop evacuation and settle people in current rooms."""
        if self._building_has_hazard():
            return
        restored = 0
        for person in self.people.values():
            if person.status not in ("evacuating", "trapped"):
                continue
            node = self.graph.nodes.get(person.position)
            if not node:
                continue
            # Don't pull people back from exits they already reached as evacuated
            person.status = "safe"
            person.path = []
            person.path_index = 0
            person.progress = 0.0
            person.wait_ticks = 0
            # Snap to room center (normal position)
            person.x = node.x + random.uniform(-0.35, 0.35)
            person.y = node.y + random.uniform(-0.35, 0.35)
            self.routes.pop(person.id, None)
            restored += 1
        if restored:
            self._recompute_occupancy()
            self._route_force = True
            if self.tick % 25 == 0:
                self._add_alert("info", "All clear — occupants returning to normal positions")

    def _update_sensors_and_hazard(self):
        for nid, room in self.rooms.items():
            if room.sensor_health == "failed":
                reading = SensorReading(45.0, 30.0, False, room.occupancy)
            else:
                # DHT22-like temp noise; gas/smoke already driven by fire sim
                jitter_t = random.uniform(-0.6, 0.6) if not room.on_fire else random.uniform(-1.8, 1.8)
                jitter_s = random.uniform(-0.8, 0.8) if room.on_fire else random.uniform(-0.25, 0.25)
                reading = SensorReading(
                    temperature=max(18.0, room.temperature + jitter_t),
                    smoke=max(0.0, min(100.0, room.smoke + jitter_s)),
                    flame=room.flame,
                    occupancy=room.occupancy,
                )
                if not room.iot_locked:
                    room.temperature = reading.temperature
                    room.smoke = reading.smoke
                elif room.on_fire:
                    # Even with IoT lock, keep simulated gas climbing with fire
                    self._simulate_sensors_for_room(room)

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

        # Push simulated sensors into device registry for IoT page (throttled)
        if self.tick % 5 == 0:
            self._publish_simulated_devices()

    def _publish_simulated_devices(self):
        """Mirror room sensors as SIM-* devices when no live ESP32 owns the room."""
        try:
            from app.services.device_registry import device_registry
        except Exception:
            return
        for nid, room in self.rooms.items():
            # Only publish active / interesting rooms to cut noise
            if not (room.on_fire or room.gas >= 600 or room.smoke >= 15 or room.alarm):
                continue
            live = None
            for d in device_registry.devices.values():
                if d.node_id == nid and d.online and not str(d.device_id).startswith("SIM-"):
                    live = d
                    break
            if live:
                continue
            name = self.graph.nodes[nid].name if nid in self.graph.nodes else nid
            status = "SAFE"
            if room.on_fire or room.flame or room.temperature >= 70 or room.gas >= 2000:
                status = "CRITICAL"
            elif room.temperature >= 45 or room.gas >= 1200 or room.smoke >= 35:
                status = "WARNING"
            device_registry.ingest(
                {
                    "deviceId": room.device_id or f"SIM-{nid}",
                    "room": name,
                    "type": "ROOM",
                    "floor": self.graph.nodes[nid].floor if nid in self.graph.nodes else 0,
                    "nodeId": nid,
                    "temperature": room.temperature,
                    "humidity": room.humidity,
                    "gasLevel": room.gas,
                    "smoke": room.smoke,
                    "flame": room.flame,
                    "status": status,
                    "battery": room.battery,
                    "signal": room.signal,
                    "occupancy": room.occupancy,
                }
            )
            from app.core.timeutil import iso_ms

            sim_id = room.device_id or f"SIM-{nid}"
            d = device_registry.devices.get(sim_id)
            if d:
                d.retrieve_ms = 0.4  # local sim ingest
                d.received_at = iso_ms()
                d.received_at_ms = int(time.time() * 1000)
            if room.last_retrieve_ms is None:
                room.last_retrieve_ms = 0.4
            room.last_received_at = iso_ms()

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

        any_fire = any(r.on_fire or r.smoke > SAFE_SMOKE_PCT for r in self.rooms.values())
        for person in self.people.values():
            if person.status == "evacuated":
                continue

            route = self.room_routes.get(person.position)
            if route and route.found:
                # Allow trapped (red) people to move again once a path exists
                if person.status == "trapped":
                    if len(route.path) > 1:
                        person.status = "evacuating"
                        person.path = route.path
                        person.path_index = 0
                        person.progress = 0.0
                        person.wait_ticks = 0
                        self.routes[person.id] = person.path
                    continue

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
                        else:
                            person.path = new_path
                            person.path_index = 0
                            person.progress = 0.0
                        if len(new_path) > 1:
                            person.status = "evacuating"
                    self.routes[person.id] = person.path
            else:
                if any_fire and person.status != "evacuated":
                    person.status = "trapped"
                    person.path = []
                    self._add_alert(
                        "danger",
                        f"{person.name} trapped — no safe exit",
                        person.position,
                    )

        # Building clear → people stop evacuating and resume SAFE
        if not any_fire:
            self._return_people_to_safe()

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
                "timestamp": iso_ms(),
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
        if not self._building_has_hazard():
            self._return_people_to_safe()
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
                    "humidity": round(r.humidity, 1),
                    "gas": round(r.gas, 1),
                    "device_id": r.device_id,
                    "battery": round(r.battery, 1),
                    "signal": round(r.signal, 1),
                    "retrieve_ms": r.last_retrieve_ms,
                    "received_at": r.last_received_at,
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
        self.mqtt = None
        self.status = "initializing"

    async def initialize(self):
        from app.config import settings
        from app.services.mqtt_bridge import MQTTBridge
        from app.services.device_registry import device_registry

        self.engine.spawn_people(40)
        broker = (settings.MQTT_BROKER or "").strip().lower()
        # Skip localhost MQTT on cloud hosts (Railway) — HTTP telemetry still works
        skip_mqtt = broker in {"", "localhost", "127.0.0.1", "disabled", "none", "-"}
        self.mqtt = MQTTBridge(settings.MQTT_BROKER, settings.MQTT_PORT, settings.MQTT_TOPIC_PREFIX)
        self.mqtt.set_command_handler(self._on_mqtt_command)
        if skip_mqtt:
            logging.getLogger(__name__).info("MQTT skipped (broker=%r) — local fail-safe mode", broker)
        else:
            self.mqtt.connect()
        device_registry.start_watchdog()
        self.status = "ready"
        self._loop_task = asyncio.create_task(self._loop())

    async def ensure_evacuation(self, reason: str = "sensor hazard") -> bool:
        """
        Sensor-driven evacuation: force route recompute and start the twin
        so occupants begin moving to safe exits.
        Returns True if the engine was (re)started.
        """
        eng = self.engine
        eng._route_force = True
        started = False
        if eng.status == SimStatus.PAUSED:
            await eng.resume()
            eng._add_alert("critical", f"Auto-evacuation resumed — {reason}")
            started = True
        elif eng.status != SimStatus.RUNNING:
            await eng.start()
            eng._add_alert("critical", f"Auto-evacuation started — {reason}")
            started = True
        else:
            # Already running — still force an immediate re-route pass
            eng._update_routes(force=True)
        return started

    def _on_mqtt_command(self, topic: str, payload: dict):
        cmd = payload.get("command") or payload.get("cmd")
        if not cmd:
            return
        if cmd == "simulation":
            action = (payload.get("payload") or {}).get("action")
            if action == "reset":
                self.engine.reset()
                self.engine.spawn_people(28)
            elif action == "fire":
                nid = (payload.get("payload") or {}).get("node_id")
                if nid:
                    self.engine.start_fire(nid, 0.75)
        elif cmd == "ping":
            device_id = topic.rstrip("/").split("/")[-1]
            if self.mqtt and device_id not in ("commands", "cmd"):
                self.mqtt.publish_device(device_id, {"pong": True, "device_id": device_id})

    async def shutdown(self):
        from app.services.device_registry import device_registry

        self.status = "shutdown"
        await device_registry.stop_watchdog()
        if self.mqtt:
            self.mqtt.disconnect()
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
