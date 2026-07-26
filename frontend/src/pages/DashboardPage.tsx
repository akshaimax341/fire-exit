import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Thermometer,
  Users,
  DoorOpen,
  AlertTriangle,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import { Panel, StatCard, Badge } from '@/components/ui';
import { FloatingSimToolbar } from '@/components/SimulationControls';
import { FloorMap2D } from '@/components/FloorMap2D';
import { useSimStore } from '@/stores/simStore';
import { hazardColor } from '@/lib/utils';

export function DashboardPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const state = useSimStore((s) => s.state);
  const metrics = state?.metrics;

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
  }, [connect, fetchState]);

  return (
    <div className="space-y-4">
      <FloatingSimToolbar />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="People Inside" value={metrics?.people_inside ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Evacuated" value={metrics?.people_evacuated ?? 0} tone="safe" />
        <StatCard label="Remaining" value={metrics?.people_remaining ?? 0} tone="warning" />
        <StatCard
          label="Avg Temp"
          value={metrics?.avg_temperature ?? 22}
          unit="°C"
          icon={<Thermometer className="h-4 w-4" />}
          tone={(metrics?.avg_temperature ?? 0) > 40 ? 'warning' : 'default'}
        />
        <StatCard label="Fire Rooms" value={metrics?.fire_rooms ?? 0} tone="critical" />
        <StatCard
          label="Blocked Exits"
          value={metrics?.blocked_exits?.length ?? 0}
          tone={(metrics?.blocked_exits?.length ?? 0) > 0 ? 'danger' : 'default'}
          icon={<DoorOpen className="h-4 w-4" />}
        />
        <StatCard
          label="Safe Exits"
          value={Math.max(0, (state?.building.nodes.filter((n) => n.type === 'exit').length ?? 0) - (metrics?.blocked_exits?.length ?? 0))}
          tone="safe"
        />
        <StatCard
          label="System"
          value={metrics?.system_health === 'nominal' ? 'OK' : 'DEG'}
          tone={metrics?.system_health === 'nominal' ? 'safe' : 'warning'}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Live Floor Plan" className="min-h-[440px] xl:col-span-2" action={<Badge tone="accent" pulse>Heatmap</Badge>}>
          <FloorMap2D heatmap />
        </Panel>

        <div className="space-y-4">
          <Panel title="Active Alerts">
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(state?.alerts ?? []).length === 0 && (
                <p className="text-xs text-muted">No active alerts — facility nominal</p>
              )}
              {(state?.alerts ?? []).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start gap-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/8"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{
                      color:
                        a.level === 'critical'
                          ? '#ff453a'
                          : a.level === 'danger'
                            ? '#ff6961'
                            : a.level === 'warning'
                              ? '#ffd60a'
                              : '#5ac8fa',
                    }}
                  />
                  <div>
                    <div className="text-xs text-slate-200">{a.message}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">
                      {new Date(a.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Panel>

          <Panel title="Facility Health">
            <div className="space-y-3 text-sm">
              <Row label="Sensor Health" value={`${metrics?.sensor_health_pct ?? 100}%`} />
              <Row label="Blocked Exits" value={String(metrics?.blocked_exits?.length ?? 0)} />
              <Row label="Blocked Corridors" value={String(metrics?.blocked_corridors?.length ?? 0)} />
              <Row label="Max Temperature" value={`${metrics?.max_temperature ?? 22}°C`} />
              <Row label="Max Smoke" value={`${metrics?.max_smoke ?? 0}%`} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted">Latency Budget</span>
                <Badge tone={(metrics?.pathfinding_ms ?? 0) < 300 ? 'safe' : 'warning'}>
                  {(metrics?.pathfinding_ms ?? 0) < 300 ? '< 300ms' : 'OVER'}
                </Badge>
              </div>
            </div>
          </Panel>

          <Panel title="Hazard Legend">
            <div className="flex flex-wrap gap-3 text-xs">
              {(['safe', 'warning', 'danger', 'critical'] as const).map((l) => (
                <div key={l} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: hazardColor(l) }} />
                  <span className="capitalize text-muted">{l}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
              <Gauge className="h-3 w-3" />
              Risk = 0.4·Flame + 0.3·Smoke + 0.2·Temp + 0.1·Crowd
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
              <DoorOpen className="h-3 w-3" />
              LED: Green safe · Yellow smoke · Red danger · Pulse critical
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-xs tabular-nums text-slate-200">{value}</span>
    </div>
  );
}
