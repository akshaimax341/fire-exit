import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Monitor, Radio, Shield, SlidersHorizontal, User } from 'lucide-react';
import { Panel, Badge, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSimStore } from '@/stores/simStore';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const connected = useSimStore((s) => s.connected);
  const status = useSimStore((s) => s.state?.status);
  const command = useSimStore((s) => s.command);
  const canControl = useAuthStore((s) => s.hasRole('admin', 'operator'));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-muted">Facility preferences · access · simulation defaults</p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Operator Profile">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tesla/80 text-lg font-bold text-white">
              {(user?.full_name ?? 'U').slice(0, 1)}
            </div>
            <div>
              <div className="font-semibold text-white">{user?.full_name}</div>
              <div className="font-mono text-xs uppercase text-muted">{user?.role}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <Row icon={<User className="h-3.5 w-3.5" />} label="Username" value={user?.username ?? '—'} />
            <Row icon={<Shield className="h-3.5 w-3.5" />} label="Access" value={user?.role ?? '—'} />
          </div>
        </Panel>

        <Panel title="Live Link">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">WebSocket</span>
              <Badge tone={connected ? 'safe' : 'danger'}>{connected ? 'Connected' : 'Offline'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Simulation</span>
              <Badge tone="accent">{status || 'idle'}</Badge>
            </div>
            <NavLink to="/iot" className="inline-flex items-center gap-2 text-xs text-accent hover:underline">
              <Radio className="h-3.5 w-3.5" /> Sensor network
            </NavLink>
          </div>
        </Panel>

        <Panel title="Simulation Defaults" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canControl}
              onClick={() => command('config', { route_interval_s: 1 })}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Route every 1s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canControl}
              onClick={() => command('config', { route_interval_s: 2 })}
            >
              Route every 2s
            </Button>
            <NavLink to="/twin">
              <Button variant="primary" size="sm">
                <Monitor className="h-3.5 w-3.5" />
                Open Digital Twin
              </Button>
            </NavLink>
          </div>
          <p className="mt-3 text-xs text-muted">
            Dark glass UI · WebSocket telemetry · A* multi-exit pathfinding. Changes apply on next control command.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/8">
      <span className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}
