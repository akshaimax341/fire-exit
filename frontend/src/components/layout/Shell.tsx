import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Box,
  BarChart3,
  Radio,
  Users,
  LogOut,
  Flame,
  Wifi,
  WifiOff,
  Menu,
  X,
  Search,
  Bell,
  Settings,
  PanelLeft,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSimStore } from '@/stores/simStore';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/twin', label: 'Digital Twin', icon: Box },
  { to: '/designer', label: 'Building Designer', icon: Building2 },
  { to: '/iot', label: 'Sensor Network', icon: Radio },
  { to: '/occupancy', label: 'Occupancy', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Command Center', subtitle: 'Live facility overview' },
  '/twin': { title: 'Digital Twin', subtitle: 'Interactive spatial model' },
  '/designer': { title: 'Building Designer', subtitle: 'Layout authoring' },
  '/iot': { title: 'Sensor Network', subtitle: 'IoT telemetry mesh' },
  '/occupancy': { title: 'Occupancy', subtitle: 'RFID badge tracking' },
  '/analytics': { title: 'Analytics', subtitle: 'Trends · exits · heatmap' },
  '/settings': { title: 'Settings', subtitle: 'System preferences' },
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopNav({
  collapsed,
  onToggleCollapse,
  onMenu,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMenu: () => void;
}) {
  const now = useClock();
  const status = useSimStore((s) => s.state?.status);
  const connected = useSimStore((s) => s.connected);
  const fireRooms = useSimStore((s) => s.state?.metrics?.fire_rooms ?? 0);
  const alerts = useSimStore((s) => s.state?.alerts?.length ?? 0);
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <header className="sticky top-0 z-30 mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-white/12 bg-black/40 px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-xl p-2 text-white/60 hover:bg-white/8 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-xl p-2 text-white/50 hover:bg-white/8 hover:text-white md:inline-flex"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-critical/50 to-critical/10 ring-1 ring-critical/40 shadow-[0_0_20px_rgba(255,69,58,0.35)]">
            <Flame className="h-4 w-4 text-critical" />
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold tracking-tight text-white">FireExit</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Spatial OS
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto hidden items-center gap-3 lg:flex">
        <div className="rounded-full bg-white/[0.05] px-3.5 py-1.5 text-center ring-1 ring-white/10">
          <div className="font-mono text-sm font-semibold tabular-nums text-white">{timeStr}</div>
          <div className="text-[9px] uppercase tracking-wider text-white/40">{dateStr}</div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ring-1',
            status === 'running' && 'bg-safe/15 text-safe ring-safe/30',
            status === 'paused' && 'bg-warning/15 text-warning ring-warning/30',
            (!status || status === 'idle') && 'bg-white/5 text-white/50 ring-white/10',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              status === 'running' && 'animate-pulse bg-safe',
              status === 'paused' && 'bg-warning',
              (!status || status === 'idle') && 'bg-white/40',
            )}
          />
          {status || 'idle'}
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1',
            fireRooms > 0
              ? 'bg-critical/20 text-critical ring-critical/40 animate-pulse'
              : 'bg-white/5 text-white/45 ring-white/10',
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          {fireRooms > 0 ? `${fireRooms} Fire Alert` : 'All Clear'}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms, badges…"
            className="w-44 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/20 lg:w-56"
          />
        </div>
        <button
          type="button"
          className="relative rounded-full bg-white/[0.05] p-2 text-white/55 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          {alerts > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[9px] font-bold text-white">
              {Math.min(alerts, 9)}
            </span>
          )}
        </button>
        <NavLink
          to="/settings"
          className="rounded-full bg-white/[0.05] p-2 text-white/55 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </NavLink>
        <div className="hidden items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3 ring-1 ring-white/10 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-tesla/80 text-[10px] font-bold text-white">
            {(user?.full_name ?? 'U').slice(0, 1)}
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold text-white">{user?.full_name}</div>
            <div className="font-mono text-[9px] uppercase text-white/40">{user?.role}</div>
          </div>
        </div>
        <span className="hidden items-center gap-1 text-[10px] text-white/40 xl:flex">
          {connected ? <Wifi className="h-3 w-3 text-safe" /> : <WifiOff className="h-3 w-3 text-danger" />}
        </span>
      </div>
    </header>
  );
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onClose,
}: {
  collapsed: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const { logout } = useAuthStore();
  const connected = useSimStore((s) => s.connected);
  const status = useSimStore((s) => s.state?.status);
  const navigate = useNavigate();
  const location = useLocation();

  const rail = (
    <motion.aside
      layout
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/12',
        'bg-[linear-gradient(165deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.04)_35%,rgba(8,8,12,0.65)_100%)]',
        'shadow-[0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.18)]',
        'backdrop-blur-[40px]',
        collapsed ? 'w-[4.5rem]' : 'w-[15rem]',
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="pointer-events-none absolute -left-8 top-20 h-32 w-32 rounded-full bg-accent/15 blur-3xl" />

      <div className={cn('flex items-center gap-2 px-3 pt-4', collapsed && 'justify-center')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-critical/25 ring-1 ring-critical/40">
          <Flame className="h-4.5 w-4.5 text-critical" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-semibold text-white">FireExit</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Control
            </div>
          </div>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded-full p-1.5 text-muted md:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {nav.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink key={item.to} to={item.to} onClick={onClose} className="relative block">
              {active && (
                <motion.div
                  layoutId="nav-glow"
                  className="absolute inset-0 rounded-2xl bg-accent/15 shadow-[0_0_0_1px_rgba(90,200,250,0.4),0_0_24px_rgba(90,200,250,0.25)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <motion.div
                whileHover={{ x: collapsed ? 0 : 3, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'relative z-10 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition',
                  collapsed && 'justify-center px-2',
                  active ? 'text-accent' : 'text-white/50 hover:text-white',
                )}
                title={item.label}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition',
                    active
                      ? 'bg-accent/20 text-accent shadow-[0_0_14px_rgba(90,200,250,0.35)]'
                      : 'bg-white/[0.04] text-white/55',
                  )}
                >
                  <item.icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                {!collapsed && <span className="font-medium tracking-tight">{item.label}</span>}
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('border-t border-white/10 p-3', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between text-[11px] text-white/45">
            <span className="flex items-center gap-1">
              {connected ? <Wifi className="h-3 w-3 text-safe" /> : <WifiOff className="h-3 w-3 text-danger" />}
              {connected ? 'Live' : 'Offline'}
            </span>
            <span className="font-mono uppercase">{status || 'idle'}</span>
          </div>
        )}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-white/50 hover:bg-critical/10 hover:text-critical',
            collapsed && 'justify-center px-2',
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign out'}
        </motion.button>
      </div>
    </motion.aside>
  );

  return (
    <>
      <div className={cn('hidden h-full shrink-0 p-3 pr-1 md:block', collapsed ? 'w-[5.25rem]' : 'w-[16rem]')}>
        {rail}
      </div>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md md:hidden"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed left-3 top-3 bottom-3 z-50 w-[15.5rem] md:hidden"
            >
              {rail}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Keep TopBar export for any legacy imports
export function TopBar(props: { title: string; subtitle?: string; onMenu?: () => void }) {
  return (
    <div className="px-4 py-2">
      <h1 className="text-lg font-semibold text-white">{props.title}</h1>
      {props.subtitle && <p className="text-xs text-muted">{props.subtitle}</p>}
    </div>
  );
}
