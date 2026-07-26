"""Unit tests for hazard fusion, device registry, and pathfinding."""

from __future__ import annotations

import time

from app.engines.hazard import SensorReading, compute_hazard
from app.engines.pathfinding import BuildingGraph, GraphEdge, GraphNode
from app.services.device_registry import DeviceRegistry, estimate_flame, gas_to_smoke


def test_hazard_safe_ambient():
    h = compute_hazard(SensorReading(22, 0, False, 0), capacity=20)
    assert h.level.value == "safe"
    assert h.score < 0.25


def test_hazard_critical_flame():
    h = compute_hazard(SensorReading(80, 70, True, 10), capacity=20)
    assert h.level.value == "critical"
    assert h.blocked is True


def test_estimate_flame_from_gas_temp():
    assert estimate_flame(90, 900, 30, 100, None) is True
    assert estimate_flame(25, 100, 24, 90, None) is False
    assert estimate_flame(25, 100, 24, 90, True) is True


def test_gas_to_smoke_mapping():
    assert gas_to_smoke(400, None) == 10.0
    assert gas_to_smoke(0, 55) == 55.0


def test_device_registry_offline():
    reg = DeviceRegistry(offline_timeout=0.05)
    reg.ingest(
        {
            "deviceId": "DEV001",
            "room": "Office 101",
            "type": "ROOM",
            "floor": 1,
            "temperature": 42,
            "humidity": 35,
            "gasLevel": 1300,
            "status": "WARNING",
        }
    )
    assert reg.get("DEV001")["online"] is True
    time.sleep(0.08)
    changed = reg.mark_offline()
    assert "DEV001" in changed
    assert reg.get("DEV001")["online"] is False


def test_astar_and_dijkstra_reach_exit():
    g = BuildingGraph()
    g.add_node(GraphNode("r1", "Room", "room", 0, 0, 0))
    g.add_node(GraphNode("c1", "Corr", "corridor", 0, 10, 0))
    g.add_node(GraphNode("e1", "Exit", "exit", 0, 20, 0))
    g.add_edge(GraphEdge("r1", "c1", 10))
    g.add_edge(GraphEdge("c1", "e1", 10))
    a = g.astar("r1", "e1")
    d = g.dijkstra("r1", "e1")
    assert a.found and d.found
    assert a.path[0] == "r1" and a.path[-1] == "e1"
    assert d.path[-1] == "e1"
    nearest = g.nearest_exit("r1")
    assert nearest.found and nearest.exit_id == "e1"
