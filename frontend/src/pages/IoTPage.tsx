import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Thermometer, Wind, Flame, Users, Radio, Bell, Lightbulb } from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { SimulationControls } from '@/components/SimulationControls';
import { useSimStore } from '@/stores/simStore';
import { cn, hazardColor } from '@/lib/utils';

export function IoTPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const state = useSimStore((s) => s.state);
  const selected = useSimStore((s) => s.selectedNodeId);
  const setSelected = useSimStore((s) => s.setSelectedNode);

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
  }, [connect, fetchState]);

  const nodes = state?.building.nodes ?? [];
  const rooms = state?.rooms ?? {};

  const cards = useMemo(
    () =>
      nodes.map((n) => ({
        node: n,
        room: rooms[n.id],
      })),
    [nodes, rooms],
  );

  return (
    <div className="space-y-4">
      <SimulationControls compact />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {cards.map(({ node, room }) => {
          const level = room?.hazard?.level ?? 'safe';
          const active = selected === node.id;
          return (
            <motion.button
              key={node.id}
              layout
              whileHover={{ y: -3 }}
              onClick={() => setSelected(node.id)}
              className={cn(
                'glass-float rounded-[1.25rem] p-4 text-left transition',
                active && 'nav-active-glow ring-1 ring-accent/50',
              )}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-white">{node.name}</div>
                  <div className="font-mono text-[10px] uppercase text-muted">
                    {node.type} · Floor {node.floor}
                  </div>
                </div>
                <Badge tone={level as 'safe'} pulse={room?.on_fire}>
                  {level}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SensorChip
                  icon={<Thermometer className="h-3 w-3" />}
                  label="Temp"
                  value={`${room?.temperature?.toFixed(1) ?? 22}°C`}
                />
                <SensorChip
                  icon={<Wind className="h-3 w-3" />}
                  label="Smoke"
                  value={`${room?.smoke?.toFixed(0) ?? 0}%`}
                />
                <SensorChip
                  icon={<Flame className="h-3 w-3" />}
                  label="Flame"
                  value={room?.flame ? 'YES' : '—'}
                  alert={!!room?.flame}
                />
                <SensorChip
                  icon={<Users className="h-3 w-3" />}
                  label="Occ"
                  value={String(room?.occupancy ?? 0)}
                />
                <SensorChip icon={<Radio className="h-3 w-3" />} label="RFID" value="ONLINE" />
                <SensorChip
                  icon={<Lightbulb className="h-3 w-3" />}
                  label="LED"
                  value={(room?.led_color ?? 'green').replace('_', ' ')}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                  <Bell className={cn('h-3 w-3', room?.alarm && 'text-critical animate-pulse')} />
                  {room?.alarm ? 'Alarm active' : 'Quiet'}
                </div>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(room?.hazard?.score ?? 0) * 100}%`,
                      background: hazardColor(level),
                    }}
                  />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <Panel title="Multi-Sensor Fusion">
        <p className="text-xs leading-relaxed text-muted">
          Each node continuously streams Thermal (DHT22-class), Particulate (MQ-2/MQ-135-class),
          Optical (IR flame), and Occupancy vectors. The hazard engine fuses them with weights 0.4 /
          0.3 / 0.2 / 0.1 and exponentially amplifies edge costs for A* routing. Sensor failures fall
          back to elevated unknown risk — never silent failure.
        </p>
      </Panel>
    </div>
  );
}

function SensorChip({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className={cn('rounded-xl bg-white/[0.04] px-2 py-1.5', alert && 'ring-1 ring-critical/40')}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={cn('mt-0.5 font-mono text-xs', alert ? 'text-critical' : 'text-slate-200')}>
        {value}
      </div>
    </div>
  );
}
