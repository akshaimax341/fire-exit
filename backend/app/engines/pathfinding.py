"""Weighted building graph + A* pathfinding for multi-exit evacuation."""

from __future__ import annotations

import heapq
import math
import time
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class GraphNode:
    id: str
    name: str
    node_type: str  # room | corridor | stairs | exit
    floor: int = 0
    x: float = 0.0
    y: float = 0.0
    capacity: int = 20
    blocked: bool = False
    hazard_score: float = 0.0
    occupancy: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphEdge:
    source: str
    target: str
    distance: float = 1.0
    bidirectional: bool = True


@dataclass
class PathResult:
    path: list[str]
    cost: float
    exit_id: Optional[str]
    latency_ms: float
    found: bool


class BuildingGraph:
    def __init__(self):
        self.nodes: dict[str, GraphNode] = {}
        self.adjacency: dict[str, list[tuple[str, float]]] = {}
        # Transient edge flow used for congestion-aware costs (people mid-edge)
        self.edge_flow: dict[tuple[str, str], int] = {}

    def clear(self):
        self.nodes.clear()
        self.adjacency.clear()
        self.edge_flow.clear()

    def add_node(self, node: GraphNode):
        self.nodes[node.id] = node
        self.adjacency.setdefault(node.id, [])

    def add_edge(self, edge: GraphEdge):
        if edge.source not in self.nodes or edge.target not in self.nodes:
            return
        self.adjacency.setdefault(edge.source, []).append((edge.target, edge.distance))
        if edge.bidirectional:
            self.adjacency.setdefault(edge.target, []).append((edge.source, edge.distance))

    def update_hazard(self, node_id: str, hazard_score: float, blocked: bool, occupancy: int = 0):
        node = self.nodes.get(node_id)
        if not node:
            return
        node.hazard_score = hazard_score
        node.blocked = blocked
        node.occupancy = occupancy

    def set_edge_flow(self, flow: dict[tuple[str, str], int]):
        self.edge_flow = flow

    def get_exits(self) -> list[GraphNode]:
        return [n for n in self.nodes.values() if n.node_type == "exit" and not n.blocked]

    def heuristic(self, a: str, b: str) -> float:
        na, nb = self.nodes[a], self.nodes[b]
        dx = na.x - nb.x
        dy = na.y - nb.y
        floor_pen = abs(na.floor - nb.floor) * 18.0
        return math.hypot(dx, dy) + floor_pen

    def traversal_cost(self, from_id: str, to_id: str, distance: float) -> float:
        """Cost = Distance·type + Hazard + Crowd + EdgeFlow congestion."""
        to_node = self.nodes[to_id]
        if to_node.blocked and to_node.node_type != "exit":
            return float("inf")

        from app.engines.hazard import edge_hazard_cost

        hazard = edge_hazard_cost(to_node.hazard_score)
        # Stronger congestion: quadratic near capacity
        fill = to_node.occupancy / max(1, to_node.capacity)
        crowd = (fill * 10.0) + (fill * fill * 18.0)

        flow = self.edge_flow.get((from_id, to_id), 0) + self.edge_flow.get((to_id, from_id), 0)
        flow_pen = flow * 1.8

        type_mult = 1.45 if to_node.node_type == "stairs" else 1.0
        if to_node.node_type == "corridor":
            type_mult = 1.05

        return (distance * type_mult) + hazard + crowd + flow_pen

    def astar(self, start: str, goal: str) -> PathResult:
        t0 = time.perf_counter()
        if start not in self.nodes or goal not in self.nodes:
            return PathResult([], float("inf"), None, 0.0, False)
        if self.nodes[start].blocked and self.nodes[start].node_type != "exit":
            return PathResult([], float("inf"), None, 0.0, False)

        open_heap: list[tuple[float, str]] = [(0.0, start)]
        came_from: dict[str, str] = {}
        g_score: dict[str, float] = {start: 0.0}
        closed: set[str] = set()

        while open_heap:
            _, current = heapq.heappop(open_heap)
            if current in closed:
                continue
            if current == goal:
                path = self._reconstruct(came_from, current)
                latency = (time.perf_counter() - t0) * 1000
                return PathResult(path, g_score[current], goal, latency, True)

            closed.add(current)
            for neighbor, dist in self.adjacency.get(current, []):
                if neighbor in closed:
                    continue
                cost = self.traversal_cost(current, neighbor, dist)
                if cost == float("inf"):
                    continue
                tentative = g_score[current] + cost
                if tentative < g_score.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative
                    f = tentative + self.heuristic(neighbor, goal)
                    heapq.heappush(open_heap, (f, neighbor))

        latency = (time.perf_counter() - t0) * 1000
        return PathResult([], float("inf"), None, latency, False)

    def nearest_exit(self, start: str) -> PathResult:
        """Multi-exit: A* to every open exit, keep lowest total cost."""
        t0 = time.perf_counter()
        exits = self.get_exits()
        if not exits or start not in self.nodes:
            return PathResult([], float("inf"), None, 0.0, False)

        # Already at an exit
        if self.nodes[start].node_type == "exit" and not self.nodes[start].blocked:
            latency = (time.perf_counter() - t0) * 1000
            return PathResult([start], 0.0, start, latency, True)

        best: Optional[PathResult] = None
        for exit_node in exits:
            result = self.astar(start, exit_node.id)
            if result.found and (best is None or result.cost < best.cost):
                best = result

        latency = (time.perf_counter() - t0) * 1000
        if best is None:
            return PathResult([], float("inf"), None, latency, False)
        best.latency_ms = latency
        return best

    def routes_from_occupied(self, occupied_ids: list[str]) -> dict[str, PathResult]:
        routes: dict[str, PathResult] = {}
        for nid in occupied_ids:
            routes[nid] = self.nearest_exit(nid)
        return routes

    def routes_for_all_rooms(self) -> dict[str, PathResult]:
        """Exact evacuation route for every room / corridor / stairs node."""
        routes: dict[str, PathResult] = {}
        for nid, node in self.nodes.items():
            if node.node_type == "exit":
                routes[nid] = PathResult([nid], 0.0, nid, 0.0, not node.blocked)
            else:
                routes[nid] = self.nearest_exit(nid)
        return routes

    @staticmethod
    def _reconstruct(came_from: dict[str, str], current: str) -> list[str]:
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    def to_dict(self) -> dict[str, Any]:
        edges = []
        seen = set()
        for src, neighbors in self.adjacency.items():
            for tgt, dist in neighbors:
                key = tuple(sorted([src, tgt]))
                if key in seen:
                    continue
                seen.add(key)
                edges.append({"source": src, "target": tgt, "distance": dist})
        return {
            "nodes": [
                {
                    "id": n.id,
                    "name": n.name,
                    "type": n.node_type,
                    "floor": n.floor,
                    "x": n.x,
                    "y": n.y,
                    "capacity": n.capacity,
                    "blocked": n.blocked,
                    "hazard_score": n.hazard_score,
                    "occupancy": n.occupancy,
                    **n.meta,
                }
                for n in self.nodes.values()
            ],
            "edges": edges,
        }
