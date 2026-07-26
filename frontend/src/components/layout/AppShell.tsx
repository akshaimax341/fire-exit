import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, TopNav } from '@/components/layout/Shell';
import { useSimStore } from '@/stores/simStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function AppShell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const immersive = ['/twin', '/designer', '/dashboard'].includes(location.pathname);
  const token = useAuthStore((s) => s.user?.access_token);
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);

  useEffect(() => {
    if (!token) return;
    void fetchState().catch(() => undefined);
    connect();
  }, [token, connect, fetchState]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onMenu={() => setMobileOpen(true)}
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'absolute inset-0',
                immersive ? 'overflow-hidden p-2 sm:p-3' : 'overflow-y-auto p-3 sm:p-4',
              )}
            >
              <div className={cn(immersive && 'h-full')}>
                <Outlet />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
