import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Thermometer,
  Wind,
  Droplets,
  Flame,
  Battery,
  Wifi,
  Radio,
  Search,
  Filter,
} from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { FloatingSimToolbar } from '@/components/SimulationControls';
import { useSimStore } from '@/stores/simStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { cn } from '@/lib/utils';

type SortKey = 'room' | 'temperature' | 'status' | 'last_seen';
type StatusFilter = 'all' | 'critical' | 'warning' | 'offline' | 'online';

export function IoTPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const setSelected = useSimStore((s) => s.setSelectedNode);
  const devices = useDeviceStore((s) => s.devices);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);
  const online = useDeviceStore((s) => s.online);
  const offline = useDeviceStore((s) => s.offline);
  const rooms = useSimStore((s) => s.state?.rooms);
  const nodes = useSimStore((s) => s.state?.building.nodes);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('room');

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
    fetchDevices().catch(() => undefined);
  }, [connect, fetchState, fetchDevices]);

  /** Merge live ESP32 devices with twin rooms so empty fleet still shows SCADA cards */
  const cards = useMemo(() => {
    if (devices.length) {
      return devices.map((d) => ({
        key: d.device_id,
        title: d.room,
        subtitle: `${d.device_id} · Floor ${d.floor}`,
        temperature: d.temperature,
        humidity: d.humidity,
        gas: d.gas,
        smoke: d.smoke,
        flame: d.flame,
        battery: d.battery,
        signal: d.signal,
        status: d.online ? d.status : 'OFFLINE',
        online: d.online,
        health: d.health,
        lastSeen: d.last_seen,
        nodeId: d.node_id,
      }));
    }
    return (nodes ?? []).map((n) => {
      const r = rooms?.[n.id];
      return {
        key: n.id,
        title: n.name,
        subtitle: `SIM-${n.id} · Floor ${n.floor}`,
        temperature: r?.temperature ?? 22,
        humidity: r?.humidity ?? 40,
        gas: r?.gas ?? 0,
        smoke: r?.smoke ?? 0,
        flame: !!r?.flame,
        battery: r?.battery ?? 100,
        signal: r?.signal ?? -55,
        status: (r?.hazard?.level ?? 'safe').toUpperCase(),
        online: r?.sensor_health !== 'failed',
        health: r?.sensor_health ?? 'ok',
        lastSeen: new Date().toISOString(),
        nodeId: n.id,
      };
    });
  }, [devices, nodes, rooms]);

  const filtered = useMemo(() => {
    let list = cards;
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.subtitle.toLowerCase().includes(query) ||
          c.key.toLowerCase().includes(query),
      );
    }
    if (status === 'offline') list = list.filter((c) => !c.online);
    if (status === 'online') list = list.filter((c) => c.online);
    if (status === 'critical')
      list = list.filter((c) => c.status === 'CRITICAL' || c.flame);
    if (status === 'warning')
      list = list.filter((c) => ['WARNING', 'ALARM'].includes(c.status));

    list = [...list].sort((a, b) => {
      if (sort === 'temperature') return b.temperature - a.temperature;
      if (sort === 'status') return a.status.localeCompare(b.status);
      if (sort === 'last_seen') return b.lastSeen.localeCompare(a.lastSeen);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [cards, q, status, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Sensor Network</h1>
          <p className="text-xs text-muted">
            ESP32 SCADA · {online} online · {offline} offline · {filtered.length} shown
          </p>
        </div>
        <FloatingSimToolbar />
      </div>

      <Panel title="Fleet Filters">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search device, room…"
              className="w-full rounded-full border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-accent/40"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
          >
            <option value="all">All status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning / Alarm</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
          >
            <option value="room">Sort: Room</option>
            <option value="temperature">Sort: Temperature</option>
            <option value="status">Sort: Status</option>
            <option value="last_seen">Sort: Last seen</option>
          </select>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-2 text-[10px] text-muted">
            <Filter className="h-3 w-3" /> Live
          </span>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((c) => (
          <motion.button
            key={c.key}
            layout
            whileHover={{ y: -3 }}
            onClick={() => c.nodeId && setSelected(c.nodeId)}
            className={cn(
              'glass-float rounded-[1.25rem] p-4 text-left transition',
              !c.online && 'opacity-70',
              (c.status === 'CRITICAL' || c.flame) && 'ring-1 ring-critical/40',
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-white">{c.title}</div>
                <div className="truncate font-mono text-[10px] uppercase text-muted">{c.subtitle}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  tone={
                    !c.online
                      ? 'warning'
                      : c.status === 'CRITICAL'
                        ? 'critical'
                        : c.status === 'ALARM' || c.status === 'WARNING'
                          ? 'warning'
                          : 'safe'
                  }
                  pulse={c.status === 'CRITICAL' || c.flame}
                >
                  {c.online ? c.status : 'OFFLINE'}
                </Badge>
                <span className={cn('text-[9px] font-semibold uppercase', c.online ? 'text-safe' : 'text-danger')}>
                  {c.online ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Chip icon={<Thermometer className="h-3 w-3" />} label="Temp" value={`${c.temperature.toFixed(1)}°C`} />
              <Chip icon={<Droplets className="h-3 w-3" />} label="Humidity" value={`${c.humidity.toFixed(0)}%`} />
              <Chip icon={<Wind className="h-3 w-3" />} label="Gas" value={String(Math.round(c.gas))} />
              <Chip icon={<Flame className="h-3 w-3" />} label="Smoke" value={`${c.smoke.toFixed(0)}%`} alert={c.flame} />
              <Chip icon={<Battery className="h-3 w-3" />} label="Battery" value={`${c.battery.toFixed(0)}%`} />
              <Chip icon={<Wifi className="h-3 w-3" />} label="Signal" value={`${c.signal.toFixed(0)} dBm`} />
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Radio className="h-3 w-3" />
                Health {c.health}
              </span>
              <span className="font-mono">{formatSeen(c.lastSeen)}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function Chip({
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
    <div className={cn('rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/8', alert && 'ring-critical/40')}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className={cn('mt-0.5 font-mono text-xs font-semibold', alert ? 'text-critical' : 'text-white')}>
        {value}
      </div>
    </div>
  );
}

function formatSeen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch {
    return iso;
  }
}
