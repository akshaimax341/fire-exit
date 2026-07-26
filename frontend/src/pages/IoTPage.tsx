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
  Timer,
  Gauge,
} from 'lucide-react';
import { Panel, Badge, Button } from '@/components/ui';
import { FloatingSimToolbar } from '@/components/SimulationControls';
import { useSimStore } from '@/stores/simStore';
import { useDeviceStore } from '@/stores/deviceStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatMs, formatTimeMs, sensorDelta } from '@/lib/utils';

type SortKey = 'room' | 'temperature' | 'status' | 'last_seen' | 'retrieve';
type StatusFilter = 'all' | 'critical' | 'warning' | 'offline' | 'online';

const AMBIENT = { temp: 22, humidity: 40, gas: 150, smoke: 0 };

export function IoTPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const setSelected = useSimStore((s) => s.setSelectedNode);
  const selected = useSimStore((s) => s.selectedNodeId);
  const command = useSimStore((s) => s.command);
  const devices = useDeviceStore((s) => s.devices);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);
  const online = useDeviceStore((s) => s.online);
  const offline = useDeviceStore((s) => s.offline);
  const rooms = useSimStore((s) => s.state?.rooms);
  const nodes = useSimStore((s) => s.state?.building.nodes);
  const canControl = useAuthStore((s) => s.hasRole('admin', 'operator'));

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('room');

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
    fetchDevices().catch(() => undefined);
  }, [connect, fetchState, fetchDevices]);

  /** Prefer one card per room: live device timing + twin sensor values */
  const cards = useMemo(() => {
    const roomNodes = (nodes ?? []).filter((n) => n.type === 'room' || n.type === 'corridor' || n.type === 'exit');
    if (!roomNodes.length && devices.length) {
      return devices.map((d) => ({
        key: d.device_id,
        title: d.room,
        subtitle: `${d.device_id} · Floor ${d.floor}`,
        temperature: d.temperature,
        humidity: d.humidity,
        gas: d.gas,
        smoke: d.smoke,
        flame: d.flame,
        fireIntensity: 0,
        battery: d.battery,
        signal: d.signal,
        status: d.online ? d.status : 'OFFLINE',
        online: d.online,
        health: d.health,
        lastSeen: d.received_at || d.last_seen,
        retrieveMs: d.retrieve_ms ?? null,
        nodeId: d.node_id,
      }));
    }

    return roomNodes.map((n) => {
      const r = rooms?.[n.id];
      const d =
        devices.find((x) => x.node_id === n.id) ||
        devices.find((x) => x.device_id === r?.device_id) ||
        devices.find((x) => x.device_id === `SIM-${n.id}`);
      const temp = d?.temperature ?? r?.temperature ?? 22;
      const humidity = d?.humidity ?? r?.humidity ?? 40;
      const gas = d?.gas ?? r?.gas ?? 0;
      const smoke = d?.smoke ?? r?.smoke ?? 0;
      const retrieveMs = d?.retrieve_ms ?? r?.retrieve_ms ?? null;
      const lastSeen = d?.received_at || r?.received_at || d?.last_seen || null;
      const statusRaw = d?.online === false ? 'OFFLINE' : d?.status || (r?.hazard?.level ?? 'safe').toUpperCase();
      return {
        key: n.id,
        title: n.name,
        subtitle: `${d?.device_id ?? r?.device_id ?? `SIM-${n.id}`} · Floor ${n.floor}`,
        temperature: temp,
        humidity,
        gas,
        smoke,
        flame: !!(d?.flame ?? r?.flame),
        fireIntensity: r?.fire_intensity ?? 0,
        battery: d?.battery ?? r?.battery ?? 100,
        signal: d?.signal ?? r?.signal ?? -55,
        status: statusRaw,
        online: d ? d.online : r?.sensor_health !== 'failed',
        health: d?.health ?? r?.sensor_health ?? 'ok',
        lastSeen: lastSeen ?? new Date().toISOString(),
        retrieveMs,
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
    if (status === 'critical') list = list.filter((c) => c.status === 'CRITICAL' || c.flame);
    if (status === 'warning') list = list.filter((c) => ['WARNING', 'ALARM'].includes(c.status));

    list = [...list].sort((a, b) => {
      if (sort === 'temperature') return b.temperature - a.temperature;
      if (sort === 'status') return a.status.localeCompare(b.status);
      if (sort === 'last_seen') return String(b.lastSeen).localeCompare(String(a.lastSeen));
      if (sort === 'retrieve') return (b.retrieveMs ?? -1) - (a.retrieveMs ?? -1);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [cards, q, status, sort]);

  const avgRetrieve = useMemo(() => {
    const vals = cards.map((c) => c.retrieveMs).filter((v): v is number => v != null && v >= 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [cards]);

  const selectedCard = filtered.find((c) => c.nodeId === selected) ?? cards.find((c) => c.nodeId === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Sensor Network</h1>
          <p className="text-xs text-muted">
            ESP32 SCADA · {online} online · {offline} offline · {filtered.length} rooms
            {avgRetrieve != null && (
              <span className="ml-2 font-mono text-accent">avg retrieve {formatMs(avgRetrieve)}</span>
            )}
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
            <option value="retrieve">Sort: Retrieve ms</option>
          </select>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-2 text-[10px] text-muted">
            <Filter className="h-3 w-3" /> Live
          </span>
        </div>
      </Panel>

      {selectedCard && canControl && selectedCard.nodeId && (
        <RoomSensorAdjust
          nodeId={selectedCard.nodeId}
          title={selectedCard.title}
          temperature={selectedCard.temperature}
          humidity={selectedCard.humidity}
          gas={selectedCard.gas}
          smoke={selectedCard.smoke}
          fireIntensity={selectedCard.fireIntensity}
          retrieveMs={selectedCard.retrieveMs}
          receivedAt={selectedCard.lastSeen}
          onApply={async (body) => {
            await command('sensors', body);
            await fetchState();
            await fetchDevices();
          }}
        />
      )}

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
              selected === c.nodeId && 'ring-1 ring-accent/50',
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
              <Chip
                icon={<Thermometer className="h-3 w-3" />}
                label="Temp"
                value={`${c.temperature.toFixed(1)}°C`}
                hint={sensorDelta(c.temperature, AMBIENT.temp, '°')}
              />
              <Chip
                icon={<Droplets className="h-3 w-3" />}
                label="Humidity"
                value={`${c.humidity.toFixed(0)}%`}
                hint={sensorDelta(c.humidity, AMBIENT.humidity, '%')}
              />
              <Chip
                icon={<Wind className="h-3 w-3" />}
                label="Gas"
                value={String(Math.round(c.gas))}
                hint={sensorDelta(c.gas, AMBIENT.gas)}
              />
              <Chip
                icon={<Flame className="h-3 w-3" />}
                label="Smoke"
                value={`${c.smoke.toFixed(0)}%`}
                alert={c.flame}
                hint={sensorDelta(c.smoke, AMBIENT.smoke, '%')}
              />
              <Chip
                icon={<Gauge className="h-3 w-3" />}
                label="Intensity"
                value={`${Math.round(c.fireIntensity * 100)}%`}
              />
              <Chip icon={<Battery className="h-3 w-3" />} label="Battery" value={`${c.battery.toFixed(0)}%`} />
              <Chip icon={<Wifi className="h-3 w-3" />} label="Signal" value={`${c.signal.toFixed(0)} dBm`} />
              <Chip
                icon={<Timer className="h-3 w-3" />}
                label="Retrieve"
                value={c.retrieveMs != null ? formatMs(c.retrieveMs) : '—'}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Radio className="h-3 w-3" />
                Health {c.health}
              </span>
              <span className="font-mono">{formatTimeMs(c.lastSeen)}</span>
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
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  alert?: boolean;
  hint?: string;
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
      {hint && <div className="mt-0.5 font-mono text-[9px] text-white/35">Δ {hint}</div>}
    </div>
  );
}

function RoomSensorAdjust({
  nodeId,
  title,
  temperature,
  humidity,
  gas,
  smoke,
  fireIntensity,
  retrieveMs,
  receivedAt,
  onApply,
}: {
  nodeId: string;
  title: string;
  temperature: number;
  humidity: number;
  gas: number;
  smoke: number;
  fireIntensity: number;
  retrieveMs: number | null;
  receivedAt: string;
  onApply: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [temp, setTemp] = useState(temperature);
  const [hum, setHum] = useState(humidity);
  const [g, setG] = useState(gas);
  const [sm, setSm] = useState(smoke);
  const [fi, setFi] = useState(fireIntensity);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTemp(temperature);
    setHum(humidity);
    setG(gas);
    setSm(smoke);
    setFi(fireIntensity);
  }, [nodeId, temperature, humidity, gas, smoke, fireIntensity]);

  return (
    <Panel title={`Sensor adjust — ${title}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1 font-mono text-accent">
          <Timer className="h-3.5 w-3.5" />
          Retrieve {retrieveMs != null ? formatMs(retrieveMs) : '—'}
        </span>
        <span className="font-mono">Received {formatTimeMs(receivedAt)}</span>
        <span className="text-white/30">Select a room card, drag sliders, Apply</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Slider label="Temperature °C" value={temp} min={18} max={120} step={0.5} onChange={setTemp} />
        <Slider label="Humidity %" value={hum} min={5} max={95} step={1} onChange={setHum} />
        <Slider label="Gas ADC" value={g} min={0} max={4095} step={10} onChange={setG} />
        <Slider label="Smoke %" value={sm} min={0} max={100} step={1} onChange={setSm} />
        <Slider label="Fire intensity" value={fi} min={0} max={1} step={0.05} onChange={setFi} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply({
                node_id: nodeId,
                temperature: temp,
                humidity: hum,
                gas: g,
                smoke: sm,
                fire_intensity: fi,
                flame: fi >= 0.2 || sm >= 40,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Apply sensors
        </Button>
      </div>
    </Panel>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-2xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/8">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
        <span className="font-mono text-white">{Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent,#5ac8fa)]"
      />
    </label>
  );
}
