import { useEffect, useMemo, useState } from 'react';
import { Panel, Badge } from '@/components/ui';
import { SimulationControls } from '@/components/SimulationControls';
import { useSimStore } from '@/stores/simStore';
import { cn } from '@/lib/utils';

export function OccupancyPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const people = useSimStore((s) => s.state?.people ?? []);
  const nodes = useSimStore((s) => s.state?.building.nodes ?? []);
  const [filter, setFilter] = useState<'all' | 'evacuating' | 'safe' | 'evacuated' | 'trapped'>('all');

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
  }, [connect, fetchState]);

  const nodeNames = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n.name])),
    [nodes],
  );

  const filtered = people.filter((p) => filter === 'all' || p.status === filter);

  const counts = {
    all: people.length,
    safe: people.filter((p) => p.status === 'safe').length,
    evacuating: people.filter((p) => p.status === 'evacuating').length,
    evacuated: people.filter((p) => p.status === 'evacuated').length,
    trapped: people.filter((p) => p.status === 'trapped').length,
  };

  return (
    <div className="space-y-4">
      <SimulationControls compact />

      <div className="flex flex-wrap gap-2">
        {(Object.keys(counts) as Array<keyof typeof counts>).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition',
              filter === k
                ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                : 'bg-white/5 text-muted hover:bg-white/10',
            )}
          >
            {k} ({counts[k]})
          </button>
        ))}
      </div>

      <Panel title="Badge Roster">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-2 pr-3 font-semibold">Badge</th>
                <th className="pb-2 pr-3 font-semibold">Name</th>
                <th className="pb-2 pr-3 font-semibold">Role</th>
                <th className="pb-2 pr-3 font-semibold">Position</th>
                <th className="pb-2 pr-3 font-semibold">Floor</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-white/5 text-xs">
                  <td className="py-2.5 pr-3 font-mono text-muted">{p.badge_id}</td>
                  <td className="py-2.5 pr-3 text-slate-200">{p.name}</td>
                  <td className="py-2.5 pr-3 text-muted">{p.role}</td>
                  <td className="py-2.5 pr-3">{nodeNames[p.position] ?? p.position}</td>
                  <td className="py-2.5 pr-3 font-mono">{p.floor}</td>
                  <td className="py-2.5">
                    <Badge
                      tone={
                        p.status === 'trapped'
                          ? 'critical'
                          : p.status === 'evacuating'
                            ? 'accent'
                            : p.status === 'evacuated'
                              ? 'safe'
                              : 'default'
                      }
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted">No occupants match this filter</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
