"""Default multi-story commercial building layout for the digital twin."""

from __future__ import annotations

from typing import Any

from app.engines.pathfinding import BuildingGraph, GraphEdge, GraphNode


def create_default_building() -> BuildingGraph:
    """
    Two-floor commercial wing:
    - Floor 0: lobby, offices, corridors, 2 ground exits
    - Floor 1: meeting rooms, labs, corridor, stairs link
    """
    g = BuildingGraph()

    nodes = [
        # Floor 0
        GraphNode("lobby", "Main Lobby", "room", 0, 200, 300, 40),
        GraphNode("corr_a", "Corridor A", "corridor", 0, 350, 300, 30),
        GraphNode("office_1", "Office 101", "room", 0, 350, 180, 8),
        GraphNode("office_2", "Office 102", "room", 0, 500, 180, 8),
        GraphNode("office_3", "Office 103", "room", 0, 500, 300, 10),
        GraphNode("corr_b", "Corridor B", "corridor", 0, 650, 300, 25),
        GraphNode("cafeteria", "Cafeteria", "room", 0, 650, 450, 35),
        GraphNode("server_room", "Server Room", "room", 0, 350, 450, 4),
        GraphNode("stairs_n", "North Stairs", "stairs", 0, 200, 150, 15),
        GraphNode("stairs_s", "South Stairs", "stairs", 0, 800, 300, 15),
        GraphNode("exit_west", "West Exit", "exit", 0, 80, 300, 50),
        GraphNode("exit_east", "East Exit", "exit", 0, 920, 300, 50),
        GraphNode("exit_south", "South Exit", "exit", 0, 650, 580, 40),
        # Floor 1
        GraphNode("corr_c", "Corridor C", "corridor", 1, 350, 300, 25),
        GraphNode("meeting_1", "Meeting 201", "room", 1, 200, 300, 12),
        GraphNode("meeting_2", "Meeting 202", "room", 1, 500, 180, 10),
        GraphNode("lab_1", "Lab 203", "room", 1, 500, 420, 15),
        GraphNode("open_office", "Open Office", "room", 1, 650, 300, 40),
        GraphNode("stairs_n_f1", "North Stairs F1", "stairs", 1, 200, 150, 15),
        GraphNode("stairs_s_f1", "South Stairs F1", "stairs", 1, 800, 300, 15),
        GraphNode("exit_roof", "Roof Access", "exit", 1, 920, 150, 20),
    ]

    for n in nodes:
        g.add_node(n)

    edges = [
        # Floor 0 connectivity
        GraphEdge("exit_west", "lobby", 12),
        GraphEdge("lobby", "corr_a", 10),
        GraphEdge("lobby", "stairs_n", 8),
        GraphEdge("corr_a", "office_1", 6),
        GraphEdge("corr_a", "office_2", 8),
        GraphEdge("corr_a", "office_3", 7),
        GraphEdge("corr_a", "server_room", 7),
        GraphEdge("corr_a", "corr_b", 12),
        GraphEdge("corr_b", "cafeteria", 8),
        GraphEdge("corr_b", "stairs_s", 6),
        GraphEdge("cafeteria", "exit_south", 10),
        GraphEdge("stairs_s", "exit_east", 8),
        # Floor 1
        GraphEdge("stairs_n_f1", "meeting_1", 8),
        GraphEdge("meeting_1", "corr_c", 8),
        GraphEdge("corr_c", "meeting_2", 7),
        GraphEdge("corr_c", "lab_1", 7),
        GraphEdge("corr_c", "open_office", 10),
        GraphEdge("open_office", "stairs_s_f1", 8),
        GraphEdge("stairs_s_f1", "exit_roof", 12),
        # Vertical stairs links
        GraphEdge("stairs_n", "stairs_n_f1", 14),
        GraphEdge("stairs_s", "stairs_s_f1", 14),
    ]

    for e in edges:
        g.add_edge(e)

    return g


def default_layout_json() -> dict[str, Any]:
    g = create_default_building()
    return {
        "name": "Horizon Tower — Wing B",
        "floors": 2,
        "description": "Two-story commercial wing with lobby, offices, labs, and three ground exits + roof access.",
        **g.to_dict(),
    }
