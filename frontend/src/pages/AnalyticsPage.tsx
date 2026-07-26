import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { motion } from 'framer-motion';
import { Panel } from '@/components/ui';
import { useSimStore } from '@/stores/simStore';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { hazardColor } from '@/lib/utils';

interface ExitUtil {
  id: string;
  name: string;
  count: number;
  blocked: boolean;
}

interface HeatCell {
  id: string;
  name: string;
  score: number;
  level: string;
  temperature: number;
  smoke: number;
  floor: number;
}

const tipStyle = {
  background: 'rgba(12,12,16,0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  backdropFilter: 'blur(16px)',
};

export function AnalyticsPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const history = useSimStore((s) => s.state?.history ?? []);
  const token = useAuthStore((s) => s.user?.access_token);
  const [exits, setExits] = useState<ExitUtil[]>([]);
  const [heatmap, setHeatmap] = useState<HeatCell[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
  }, [connect, fetchState]);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      api<{ exits: ExitUtil[] }>('/api/analytics/exit-utilization', {}, token)
        .then((d) => setExits(d.exits))
        .catch(() => undefined);
      api<{ cells: HeatCell[] }>('/api/analytics/heatmap', {}, token)
        .then((d) => setHeatmap(d.cells))
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [token]);

  const chartData = history.map((h) => ({
    tick: h.tick,
    temp: h.avg_temp,
    maxTemp: h.max_temp,
    smoke: h.avg_smoke,
    evacuated: h.evacuated,
    inside: h.people_inside,
    pathMs: h.path_ms,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Temperature Over Time">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff453a" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ff453a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#8e8e93" fontSize={10} />
                <YAxis stroke="#8e8e93" fontSize={10} />
                <Tooltip contentStyle={tipStyle} />
                <Area type="monotone" dataKey="temp" stroke="#ff6961" fill="url(#tempGrad)" />
                <Area
                  type="monotone"
                  dataKey="maxTemp"
                  stroke="#ff453a"
                  fill="transparent"
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Smoke Density Over Time">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="smokeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffd60a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ffd60a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#8e8e93" fontSize={10} />
                <YAxis stroke="#8e8e93" fontSize={10} />
                <Tooltip contentStyle={tipStyle} />
                <Area type="monotone" dataKey="smoke" stroke="#ffd60a" fill="url(#smokeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="People Evacuated vs Inside">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="tick" stroke="#8e8e93" fontSize={10} />
                <YAxis stroke="#8e8e93" fontSize={10} />
                <Tooltip contentStyle={tipStyle} />
                <Line type="monotone" dataKey="evacuated" stroke="#30d158" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="inside" stroke="#5ac8fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Exit Utilization">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exits}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#8e8e93" fontSize={10} />
                <YAxis stroke="#8e8e93" fontSize={10} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" fill="#3e6ae1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Interactive Hazard Heatmap">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {heatmap.map((c) => (
            <motion.button
              key={c.id}
              type="button"
              whileHover={{ scale: 1.04, y: -2 }}
              onHoverStart={() => setHoverId(c.id)}
              onHoverEnd={() => setHoverId(null)}
              className="rounded-2xl p-3 text-left ring-1 ring-white/10 transition"
              style={{
                background: `${hazardColor(c.level)}${hoverId === c.id ? '35' : '18'}`,
                boxShadow:
                  hoverId === c.id ? `0 0 24px ${hazardColor(c.level)}55` : undefined,
              }}
            >
              <div className="truncate text-xs font-medium text-slate-200">{c.name}</div>
              <div className="mt-1 font-mono text-lg font-semibold" style={{ color: hazardColor(c.level) }}>
                {(c.score * 100).toFixed(0)}
              </div>
              <div className="font-mono text-[10px] text-muted">
                {c.temperature.toFixed(0)}°C · {c.smoke.toFixed(0)}% · F{c.floor}
              </div>
            </motion.button>
          ))}
        </div>
      </Panel>

      <Panel title="Pathfinding Latency">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="tick" stroke="#8e8e93" fontSize={10} />
              <YAxis stroke="#8e8e93" fontSize={10} domain={[0, 300]} />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="pathMs" stroke="#5ac8fa" strokeWidth={2} dot={false} name="ms" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Evaluation target: routing update &lt; 300ms of state change
        </p>
      </Panel>
    </div>
  );
}
