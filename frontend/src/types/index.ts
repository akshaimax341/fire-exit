export type Role = 'admin' | 'operator' | 'viewer';

export type HazardLevel = 'safe' | 'warning' | 'danger' | 'critical';

export type NodeType = 'room' | 'corridor' | 'stairs' | 'exit';

export type SimStatus = 'idle' | 'running' | 'paused';

export type PersonStatus = 'safe' | 'evacuating' | 'evacuated' | 'trapped';

export interface BuildingNode {
  id: string;
  name: string;
  type: NodeType;
  floor: number;
  x: number;
  y: number;
  capacity: number;
  blocked: boolean;
  hazard_score: number;
  occupancy: number;
}

export interface BuildingEdge {
  source: string;
  target: string;
  distance: number;
}

export interface HazardInfo {
  temperature_risk: number;
  smoke_risk: number;
  flame_risk: number;
  crowd_risk: number;
  score: number;
  level: HazardLevel;
  blocked: boolean;
  edge_cost: number;
}

export interface RoomState {
  node_id: string;
  temperature: number;
  smoke: number;
  flame: boolean;
  fire_intensity: number;
  on_fire: boolean;
  sensor_health: string;
  led_color: string;
  alarm: boolean;
  occupancy: number;
  hazard: HazardInfo;
}

export interface Person {
  id: string;
  badge_id: string;
  name: string;
  role: string;
  position: string;
  x: number;
  y: number;
  floor: number;
  speed: number;
  status: PersonStatus;
  path: string[];
  heading?: number;
  walk_phase?: number;
}

export interface RouteInfo {
  path: string[];
  cost: number | null;
  exit_id: string | null;
  found: boolean;
  latency_ms: number;
}

export interface Alert {
  id: string;
  level: string;
  message: string;
  node_id: string | null;
  timestamp: string;
}

export interface Metrics {
  people_inside: number;
  people_evacuated: number;
  people_remaining: number;
  people_trapped: number;
  total_people: number;
  avg_temperature: number;
  avg_smoke: number;
  max_temperature: number;
  max_smoke: number;
  fire_rooms: number;
  fire_room_ids: string[];
  blocked_exits: string[];
  blocked_corridors: string[];
  sensor_health_pct: number;
  pathfinding_ms: number;
  active_alerts: number;
  system_health: string;
}

export interface HistoryPoint {
  tick: number;
  t: number;
  avg_temp: number;
  avg_smoke: number;
  max_temp: number;
  max_smoke: number;
  people_inside: number;
  evacuated: number;
  fire_rooms: number;
  path_ms: number;
}

export interface SimulationState {
  status: SimStatus;
  tick: number;
  elapsed_s: number;
  config: {
    spread_rate: number;
    smoke_rate: number;
    heat_rate: number;
  };
  building: {
    nodes: BuildingNode[];
    edges: BuildingEdge[];
  };
  rooms: Record<string, RoomState>;
  people: Person[];
  routes: Record<string, RouteInfo>;
  alerts: Alert[];
  history: HistoryPoint[];
  metrics: Metrics;
}

export interface AuthUser {
  username: string;
  role: Role;
  full_name: string;
  access_token: string;
}
