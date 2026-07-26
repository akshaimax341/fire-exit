import { create } from 'zustand';
import type { SimulationState, BuildingNode, BuildingEdge } from '@/types';
import { api, wsUrl } from '@/lib/api';
import { useAuthStore } from './authStore';

interface SimStore {
  state: SimulationState | null;
  connected: boolean;
  selectedNodeId: string | null;
  floor: number;
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;
  setSelectedNode: (id: string | null) => void;
  setFloor: (f: number) => void;
  applySnapshot: (data: SimulationState) => void;
  command: (cmd: string, payload?: Record<string, unknown>) => Promise<void>;
  fetchState: () => Promise<void>;
  updateLayout: (nodes: BuildingNode[], edges: BuildingEdge[]) => Promise<void>;
}

const emptyMetrics = {
  people_inside: 0,
  people_evacuated: 0,
  people_remaining: 0,
  people_trapped: 0,
  total_people: 0,
  avg_temperature: 22,
  avg_smoke: 0,
  max_temperature: 22,
  max_smoke: 0,
  fire_rooms: 0,
  fire_room_ids: [] as string[],
  blocked_exits: [] as string[],
  blocked_corridors: [] as string[],
  sensor_health_pct: 100,
  pathfinding_ms: 0,
  active_alerts: 0,
  system_health: 'nominal',
};

export const useSimStore = create<SimStore>((set, get) => ({
  state: null,
  connected: false,
  selectedNodeId: null,
  floor: 0,
  ws: null,

  applySnapshot: (data) => set({ state: data }),

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setFloor: (f) => set({ floor: f }),

  connect: () => {
    const existing = get().ws;
    if (existing && existing.readyState <= 1) return;

    const ws = new WebSocket(wsUrl('/ws/simulation'));
    ws.onopen = () => set({ connected: true, ws });
    ws.onclose = () => set({ connected: false, ws: null });
    ws.onerror = () => set({ connected: false });
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'snapshot' || msg.event === 'tick' || msg.event === 'status') {
          if (msg.data) set({ state: msg.data });
        }
      } catch {
        /* ignore */
      }
    };
    set({ ws });
  },

  disconnect: () => {
    get().ws?.close();
    set({ ws: null, connected: false });
  },

  fetchState: async () => {
    const token = useAuthStore.getState().user?.access_token;
    const data = await api<SimulationState>('/api/simulation/state', {}, token);
    set({ state: data });
  },

  command: async (cmd, payload = {}) => {
    const token = useAuthStore.getState().user?.access_token;
    const map: Record<string, { path: string; body?: unknown }> = {
      start: { path: '/api/simulation/start' },
      pause: { path: '/api/simulation/pause' },
      resume: { path: '/api/simulation/resume' },
      reset: { path: '/api/simulation/reset' },
      fire: { path: '/api/simulation/fire', body: payload },
      extinguish: { path: '/api/simulation/extinguish', body: payload },
      smoke: { path: '/api/simulation/smoke', body: payload },
      'block-exit': { path: '/api/simulation/block-exit', body: payload },
      'unblock-exit': { path: '/api/simulation/unblock-exit', body: payload },
      spawn: { path: '/api/simulation/spawn', body: payload },
      'spawn-max': { path: '/api/simulation/spawn-max' },
      'random-fire': { path: '/api/simulation/random-fire' },
      'random-crowd': { path: '/api/simulation/random-crowd' },
      config: { path: '/api/simulation/config', body: payload },
    };
    const entry = map[cmd];
    if (!entry) return;
    const method = cmd === 'config' ? 'PATCH' : 'POST';
    await api(
      entry.path,
      {
        method,
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      },
      token,
    );
    // Refresh if WS lag
    if (['reset', 'start'].includes(cmd)) {
      await get().fetchState();
    }
  },

  updateLayout: async (nodes, edges) => {
    const token = useAuthStore.getState().user?.access_token;
    await api(
      '/api/building/layout',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Custom Building',
          floors: Math.max(...nodes.map((n) => n.floor), 0) + 1,
          nodes: nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            floor: n.floor,
            x: n.x,
            y: n.y,
            capacity: n.capacity,
          })),
          edges,
        }),
      },
      token,
    );
    await get().fetchState();
  },
}));

export { emptyMetrics };
