import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  DoorOpen,
  AlertTriangle,
  Radio,
  Thermometer,
} from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { FloatingSimToolbar } from '@/components/SimulationControls';
import { FloorMap2D } from '@/components/FloorMap2D';
import { useSimStore } from '@/stores/simStore';
import { useAlertStore } from '@/stores/alertStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { cn } from '@/lib/utils';
import type { FacilityAlert } from '@/types';

export function DashboardPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const state = useSimStore((s) => s.state);
  const metrics = state?.metrics;
  const stats = useAlertStore((s) => s.stats);
  const fetchStats = useAlertStore((s) => s.fetchStats);
  const fetchAlerts = useAlertStore((s) => s.fetchAlerts);
  const facilityAlerts = useAlertStore((s) => s.alerts);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);
  const devices = useDeviceStore((s) => s.devices);
  const online = useDeviceStore((s) => s.online);
  const offline = useDeviceStore((s) => s.offline);
  const lastRetrieve = devices
    .map((d) => d.retrieve_ms)
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a)[0];
  const rooms = state?.rooms;
  const roomRetrieve =
    rooms &&
    Object.values(rooms)
      .map((r) => r.retrieve_ms)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)[0];
  const showRetrieve = lastRetrieve ?? roomRetrieve;

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
    fetchStats().catch(() => undefined);
    fetchAlerts().catch(() => undefined);
    fetchDevices().catch(() => undefined);
    const id = setInterval(() => {
      fetchStats().catch(() => undefined);
      fetchDevices().catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, [connect, fetchState, fetchStats, fetchAlerts, fetchDevices]);

  const alerts = (facilityAlerts.length ? facilityAlerts : state?.alerts ?? []) as FacilityAlert[];
  const fireRooms = stats?.fire_rooms ?? metrics?.fire_rooms ?? 0;
  const evacuated = stats?.people_evacuated ?? metrics?.people_evacuated ?? 0;
  const inside = stats?.people_inside ?? metrics?.people_inside ?? 0;
  const maxTemp = stats?.max_temperature ?? metrics?.max_temperature ?? 22;
  const deviceTotal = (stats?.online_devices ?? online) + (stats?.offline_devices ?? offline);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <FloatingSimToolbar />

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Inside" value={inside} />
        <Kpi label="Evacuated" value={evacuated} tone="safe" />
        <Kpi
          icon={<Thermometer className="h-3.5 w-3.5" />}
          label="Max °C"
          value={Math.round(Number(maxTemp))}
          tone={Number(maxTemp) > 50 ? 'critical' : 'default'}
        />
        <Kpi label="Fire" value={fireRooms} tone={fireRooms > 0 ? 'critical' : 'default'} />
        <Kpi
          icon={<DoorOpen className="h-3.5 w-3.5" />}
          label="Blocked"
          value={stats?.blocked_exits ?? metrics?.blocked_exits?.length ?? 0}
        />
        <Kpi
          icon={<Radio className="h-3.5 w-3.5" />}
          label="Devices"
          value={`${stats?.online_devices ?? online}/${deviceTotal}`}
          tone="safe"
        />
        <div className="ml-auto hidden text-[10px] text-muted sm:block">
          {showRetrieve != null && (
            <span className="mr-2 font-mono text-accent">Retrieve {Number(showRetrieve).toFixed(1)}ms</span>
          )}
          Path {Math.round(metrics?.pathfinding_ms ?? 0)}ms ·{' '}
          {(stats?.system_health ?? metrics?.system_health) === 'nominal' ? 'OK' : 'DEG'}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Panel
          title="Live Floor Plan"
          className="min-h-0"
          bodyClassName="flex min-h-0 flex-col p-2 sm:p-3"
          action={
            <Badge tone={fireRooms > 0 ? 'critical' : 'safe'} pulse={fireRooms > 0}>
              {fireRooms > 0 ? `${fireRooms} Fire` : 'Clear'}
            </Badge>
          }
        >
          <FloorMap2D heatmap className="min-h-0 flex-1" />
        </Panel>

        <Panel title="Alerts" className="min-h-0" bodyClassName="flex min-h-0 flex-col overflow-hidden p-2">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {alerts.length === 0 && <p className="px-1 text-xs text-muted">No active alerts</p>}
            {alerts.slice(0, 16).map((a, i) => (
              <motion.div
                key={a.id || a.alert_id || i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/8"
              >
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{
                    color:
                      a.level === 'CRITICAL' || a.level === 'critical'
                        ? '#ff453a'
                        : a.level === 'WARNING' || a.level === 'danger'
                          ? '#ffd60a'
                          : '#5ac8fa',
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[11px] leading-snug text-slate-200">{a.message}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-muted">
                    {new Date(a.timestamp).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                    } as Intl.DateTimeFormatOptions)}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'default' | 'safe' | 'critical';
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 ring-1 ring-white/8">
      {icon && <span className="text-white/45">{icon}</span>}
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <span
        className={cn(
          'font-mono text-xs font-semibold tabular-nums',
          tone === 'safe' && 'text-safe',
          tone === 'critical' && 'text-critical',
          tone === 'default' && 'text-white',
        )}
      >
        {value}
      </span>
    </div>
  );
}
