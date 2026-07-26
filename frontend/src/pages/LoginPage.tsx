import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Shield, Eye, Cpu } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';

const demos = [
  { user: 'admin', pass: 'admin123', role: 'Administrator', icon: Shield, desc: 'Full system control' },
  { user: 'operator', pass: 'operator123', role: 'Operator', icon: Cpu, desc: 'Run simulations' },
  { user: 'viewer', pass: 'viewer123', role: 'Viewer', icon: Eye, desc: 'Monitor only' },
];

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('operator123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-accent/15 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[360px] w-[360px] rounded-full bg-critical/10 blur-[110px]" />
        <div className="absolute bottom-[20%] left-[-8%] h-[280px] w-[280px] rounded-full bg-tesla/15 blur-[90px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-critical/20 ring-1 ring-critical/40 shadow-[0_0_40px_rgba(255,69,58,0.25)]"
          >
            <Flame className="h-8 w-8 text-critical" />
          </motion.div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">FireExit</h1>
          <p className="mt-2 text-sm font-medium text-muted">
            Spatial command OS · Smart evacuation twin
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-strong space-y-4 rounded-[1.75rem] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        >
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-xs text-critical">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Authenticating…' : 'Enter Command Center'}
          </Button>
        </form>

        <div className="mt-6 grid gap-2">
          <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Demo Access
          </p>
          {demos.map((d, i) => (
            <motion.button
              key={d.user}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06 }}
              whileHover={{ scale: 1.01, x: 2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => {
                setUsername(d.user);
                setPassword(d.pass);
              }}
              className="glass-float flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
            >
              <d.icon className="h-4 w-4 text-accent" />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">{d.role}</div>
                <div className="font-mono text-[10px] text-muted">
                  {d.user} / {d.pass}
                </div>
              </div>
              <span className="text-[10px] text-muted">{d.desc}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
