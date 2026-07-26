import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Flame,
  CloudFog,
  DoorClosed,
  UserPlus,
  Users,
  Dices,
  Square,
  FireExtinguisher,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useSimStore } from '@/stores/simStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function FloatingSimToolbar({ className }: { className?: string }) {
  const status = useSimStore((s) => s.state?.status);
  const selected = useSimStore((s) => s.selectedNodeId);
  const command = useSimStore((s) => s.command);
  const canControl = useAuthStore((s) => s.hasRole('admin', 'operator'));

  if (!canControl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl',
        className,
      )}
    >
      {status !== 'running' ? (
        <Button
          variant="success"
          size="sm"
          onClick={() => command(status === 'paused' ? 'resume' : 'start')}
        >
          <Play className="h-3.5 w-3.5" />
          Start
        </Button>
      ) : (
        <Button variant="warning" size="sm" onClick={() => command('pause')}>
          <Pause className="h-3.5 w-3.5" />
          Pause
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => command('reset')}>
        <Square className="h-3.5 w-3.5" />
        Reset
      </Button>
      <div className="mx-0.5 h-6 w-px bg-white/15" />
      <Button
        variant="danger"
        size="sm"
        onClick={() =>
          selected
            ? command('fire', { node_id: selected, intensity: 0.8 })
            : command('random-fire')
        }
      >
        <Flame className="h-3.5 w-3.5" />
        Start Fire
      </Button>
      <Button
        variant="warning"
        size="sm"
        disabled={!selected}
        onClick={() => selected && command('smoke', { node_id: selected, amount: 40 })}
      >
        <CloudFog className="h-3.5 w-3.5" />
        Add Smoke
      </Button>
      <Button variant="ghost" size="sm" onClick={() => command('spawn', { count: 50 })}>
        <Users className="h-3.5 w-3.5" />
        Add Crowd
      </Button>
      <Button
        variant="danger"
        size="sm"
        disabled={!selected}
        onClick={() => selected && command('block-exit', { exit_id: selected })}
      >
        <DoorClosed className="h-3.5 w-3.5" />
        Block Exit
      </Button>
      <Button
        variant="success"
        size="sm"
        onClick={() => command('extinguish', selected ? { node_id: selected } : {})}
      >
        <FireExtinguisher className="h-3.5 w-3.5" />
        Extinguish
      </Button>
      <div className="mx-0.5 h-6 w-px bg-white/15" />
      <Button variant="ghost" size="sm" onClick={() => command('spawn-max')}>
        <UserPlus className="h-3.5 w-3.5" />
        1000
      </Button>
      <Button variant="ghost" size="sm" onClick={() => command('random-fire')}>
        <Dices className="h-3.5 w-3.5" />
        Random
      </Button>
      <Button variant="ghost" size="sm" onClick={() => command('reset')}>
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  );
}

/** @deprecated use FloatingSimToolbar — kept for compact embeds */
export function SimulationControls({ compact }: { compact?: boolean }) {
  if (compact) return <FloatingSimToolbar />;
  return (
    <div className="flex justify-center">
      <FloatingSimToolbar />
    </div>
  );
}
