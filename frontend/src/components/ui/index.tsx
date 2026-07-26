import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Panel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn('glass-float overflow-hidden rounded-[1.35rem]', className)}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3.5">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'safe' | 'warning' | 'danger' | 'critical' | 'accent';
  icon?: ReactNode;
}) {
  const tones = {
    default: 'text-white',
    safe: 'text-safe',
    warning: 'text-warning',
    danger: 'text-danger',
    critical: 'text-critical',
    accent: 'text-accent',
  };
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="glass-float rounded-[1.2rem] p-4"
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {label}
        </span>
        {icon && <span className="text-muted/80">{icon}</span>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className={cn('font-mono text-2xl font-semibold tabular-nums tracking-tight', tones[tone])}>
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-muted">{unit}</span>}
      </div>
    </motion.div>
  );
}

export function Badge({
  children,
  tone = 'default',
  pulse,
}: {
  children: ReactNode;
  tone?: 'default' | 'safe' | 'warning' | 'danger' | 'critical' | 'accent';
  pulse?: boolean;
}) {
  const map = {
    default: 'bg-white/8 text-slate-300',
    safe: 'bg-safe/15 text-safe',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    critical: 'bg-critical/20 text-critical',
    accent: 'bg-accent/15 text-accent',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        map[tone],
        pulse && 'animate-pulse',
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'warning' | 'success';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants = {
    primary: 'bg-tesla text-white shadow-[0_8px_24px_rgba(62,106,225,0.35)] hover:brightness-110',
    ghost: 'bg-white/[0.06] text-slate-200 ring-1 ring-white/10 hover:bg-white/10',
    danger: 'bg-critical/90 text-white shadow-[0_8px_24px_rgba(255,69,58,0.3)] hover:brightness-110',
    warning: 'bg-warning/90 text-black hover:brightness-105',
    success: 'bg-safe text-black shadow-[0_8px_24px_rgba(48,209,88,0.25)] hover:brightness-105',
  };
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition disabled:opacity-40',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variants[variant],
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
