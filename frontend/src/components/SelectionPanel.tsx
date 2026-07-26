import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Flame,
  CloudFog,
  Thermometer,
  Users,
  DoorOpen,
  Activity,
  Droplets,
  Battery,
  Wifi,
  Radio,
  Timer,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useSimStore } from '@/stores/simStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function SelectionPanel({ className }: { className?: string }) {
  const selected = useSimStore((s) => s.selectedNodeId);
  const nodes = useSimStore((s) => s.state?.building.nodes);
  const rooms = useSimStore((s) => s.state?.rooms);
  const routes = useSimStore((s) => s.state?.routes);
  const history = useSimStore((s) => s.state?.history ?? []);
  const command = useSimStore((s) => s.command);
  const canControl = useAuthStore((s) => s.hasRole('admin', 'operator'));
  const devices = useDeviceStore((s) => s.devices);

  const node = nodes?.find((n) => n.id === selected);
  const room = selected ? rooms?.[selected] : null;
  const route = selected ? routes?.[selected] : null;
  const device =
    devices.find((d) => d.node_id === selected) ||
    devices.find((d) => d.device_id === room?.device_id);

  const spark = useMemo(
    () =>
      history.slice(-20).map((h) => ({
        t: h.tick,
        temp: h.avg_temp,
        smoke: h.avg_smoke,
      })),
    [history],
  );

  const travel =
    route?.cost != null && Number.isFinite(route.cost)
      ? `${Math.max(1, Math.round(route.cost / 12))}s · cost ${route.cost.toFixed(1)}`
      : '—';

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn('glass-float flex h-full flex-col overflow-hidden rounded-[1.5rem]', className)}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Selection
        </div>
        <div className="mt-1 text-lg font-semibold tracking-tight text-white">
          {node?.name ?? 'Select a room'}
        </div>
        {node && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{node.type}</Badge>
            {(device?.device_id || room?.device_id) && (
              <Badge tone="accent">{device?.device_id || room?.device_id}</Badge>
            )}
            {room && (
              <Badge
                tone={
                  room.hazard?.level === 'critical'
                    ? 'critical'
                    : room.hazard?.level === 'warning'
                      ? 'warning'
                      : room.hazard?.level === 'danger'
                        ? 'danger'
                        : 'safe'
                }
                pulse={!!room.on_fire}
              >
                {room.hazard?.level ?? 'safe'}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!selected && (
          <p className="text-xs leading-relaxed text-white/45">
            Click a room in the twin to inspect ESP32 telemetry and evacuation guidance.
          </p>
        )}

        {selected && room && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={<Thermometer className="h-3.5 w-3.5" />} label="Temperature" value={`${room.temperature}°C`} />
              <Metric icon={<Droplets className="h-3.5 w-3.5" />} label="Humidity" value={`${device?.humidity ?? room.humidity ?? 40}%`} />
              <Metric icon={<CloudFog className="h-3.5 w-3.5" />} label="Gas" value={String(Math.round(device?.gas ?? room.gas ?? 0))} />
              <Metric icon={<Flame className="h-3.5 w-3.5" />} label="Smoke" value={`${room.smoke}%`} alert={room.flame} />
              <Metric icon={<Users className="h-3.5 w-3.5" />} label="People" value={String(room.occupancy)} />
              <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Hazard" value={String(room.hazard?.score?.toFixed(2) ?? '0')} />
              <Metric icon={<DoorOpen className="h-3.5 w-3.5" />} label="Exit" value={route?.exit_id ?? '—'} />
              <Metric icon={<Timer className="h-3.5 w-3.5" />} label="Travel" value={travel} />
              <Metric icon={<Battery className="h-3.5 w-3.5" />} label="Battery" value={`${device?.battery ?? room.battery ?? 100}%`} />
              <Metric icon={<Wifi className="h-3.5 w-3.5" />} label="Signal" value={`${device?.signal ?? room.signal ?? -55} dBm`} />
              <Metric icon={<Radio className="h-3.5 w-3.5" />} label="Sensor" value={room.sensor_health} />
              <Metric
                icon={<Timer className="h-3.5 w-3.5" />}
                label="Retrieve"
                value={
                  (device?.retrieve_ms ?? room.retrieve_ms) != null
                    ? `${Number(device?.retrieve_ms ?? room.retrieve_ms).toFixed(1)} ms`
                    : '—'
                }
              />
            </div>

            <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/8">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Last Updated · ms
              </div>
              <div className="font-mono text-xs text-white/70">
                {device?.received_at || room.received_at || device?.last_seen
                  ? new Date(
                      device?.received_at || room.received_at || device?.last_seen || '',
                    ).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                    } as Intl.DateTimeFormatOptions)
                  : 'Simulation tick'}
              </div>
              {(device?.retrieve_ms ?? room.retrieve_ms) != null && (
                <div className="mt-1 font-mono text-[11px] text-accent">
                  Retrieve {Number(device?.retrieve_ms ?? room.retrieve_ms).toFixed(3)} ms
                </div>
              )}
              {route?.found && (
                <div className="mt-2 text-[11px] text-white/50">
                  Route: <span className="font-mono text-accent">{route.path.join(' → ')}</span>
                </div>
              )}
            </div>

            {canControl && (
              <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/8">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Sensor adjust
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      command('sensors', {
                        node_id: selected,
                        temperature: Math.min(120, room.temperature + 15),
                        gas: Math.min(4095, (room.gas ?? 0) + 400),
                        smoke: Math.min(100, room.smoke + 20),
                        fire_intensity: Math.min(1, (room.fire_intensity ?? 0) + 0.25),
                        flame: true,
                      })
                    }
                  >
                    Boost sensors
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() =>
                      command('sensors', {
                        node_id: selected,
                        temperature: 22,
                        humidity: 40,
                        gas: 150,
                        smoke: 0,
                        fire_intensity: 0,
                        flame: false,
                      })
                    }
                  >
                    Reset ambient
                  </Button>
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Live Graph
              </div>
              <div className="h-28 rounded-2xl bg-black/30 ring-1 ring-white/8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spark}>
                    <defs>
                      <linearGradient id="selTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff453a" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#ff453a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(12,12,16,0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Area type="monotone" dataKey="temp" stroke="#ff6961" fill="url(#selTemp)" strokeWidth={2} />
                    <Area type="monotone" dataKey="smoke" stroke="#ffd60a" fill="transparent" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {canControl && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => command('fire', { node_id: selected, intensity: 0.5 })}
                >
                  <Flame className="h-3.5 w-3.5" /> Start Fire
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() => command('smoke', { node_id: selected, amount: 25 })}
                >
                  <CloudFog className="h-3.5 w-3.5" /> Add Smoke
                </Button>
                <Button size="sm" variant="ghost" onClick={() => command('spawn', { count: 25 })}>
                  <Users className="h-3.5 w-3.5" /> Crowd
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={node?.type !== 'exit'}
                  onClick={() => command('block-exit', { exit_id: selected })}
                >
                  <DoorOpen className="h-3.5 w-3.5" /> Block Exit
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}

function Metric({
  icon,
  label,
  value,
  alert,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/8', alert && 'ring-critical/40')}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-sm font-semibold', alert ? 'text-critical' : 'text-white')}>
        {value}
      </div>
    </div>
  );
}
