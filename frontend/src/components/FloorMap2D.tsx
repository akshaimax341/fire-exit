import { useMemo, useRef, useState, useCallback } from 'react';
import { useSimStore } from '@/stores/simStore';
import { hazardColor, ledColor, nodeTypeColor, cn } from '@/lib/utils';
import type { BuildingNode, NodeType } from '@/types';

function planSize(type: NodeType, capacity: number): { w: number; h: number } {
  switch (type) {
    case 'corridor':
      return { w: 128, h: 40 };
    case 'stairs':
      return { w: 68, h: 68 };
    case 'exit':
      return { w: 74, h: 38 };
    default: {
      const s = Math.min(134, Math.max(74, 62 + capacity * 1.4));
      return { w: s, h: s * 0.78 };
    }
  }
}

export function FloorMap2D({
  heatmap = true,
  className,
}: {
  heatmap?: boolean;
  className?: string;
}) {
  const state = useSimStore((s) => s.state);
  const floor = useSimStore((s) => s.floor);
  const setFloor = useSimStore((s) => s.setFloor);
  const selected = useSimStore((s) => s.selectedNodeId);
  const setSelected = useSimStore((s) => s.setSelectedNode);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(0.85);
  const [heatOn, setHeatOn] = useState(heatmap);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const nodes = state?.building.nodes ?? [];
  const edges = state?.building.edges ?? [];
  const rooms = state?.rooms ?? {};
  const people = state?.people ?? [];
  const routes = state?.routes ?? {};

  const floorNodes = useMemo(() => nodes.filter((n) => n.floor === floor), [nodes, floor]);
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  const floorEdges = useMemo(() => {
    return edges.filter((e) => {
      const a = nodeMap[e.source];
      const b = nodeMap[e.target];
      return a && b && (a.floor === floor || b.floor === floor);
    });
  }, [edges, nodeMap, floor]);

  const activePaths = useMemo(() => {
    // Exact route for every room that has a found path
    const paths: { id: string; path: string[] }[] = [];
    Object.entries(routes).forEach(([id, r]) => {
      if (r.found && r.path.length > 1) paths.push({ id, path: r.path });
    });
    return paths;
  }, [routes]);

  const bounds = useMemo(() => {
    if (!floorNodes.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    floorNodes.forEach((n) => {
      const s = planSize(n.type, n.capacity);
      minX = Math.min(minX, n.x - s.w / 2);
      maxX = Math.max(maxX, n.x + s.w / 2);
      minY = Math.min(minY, n.y - s.h / 2);
      maxY = Math.max(maxY, n.y + s.h / 2);
    });
    return { minX, minY, maxX, maxY };
  }, [floorNodes]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.node) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const floors = useMemo(() => {
    const set = new Set(nodes.map((n) => n.floor));
    return Array.from(set).sort();
  }, [nodes]);

  const slabPad = 52;
  const slabX = bounds.minX - slabPad;
  const slabY = bounds.minY - slabPad;
  const slabW = bounds.maxX - bounds.minX + slabPad * 2;
  const slabH = bounds.maxY - bounds.minY + slabPad * 2;

  return (
    <div
      className={cn(
        'relative h-full min-h-[280px] overflow-hidden rounded-[1.1rem] bg-[#08080a] ring-1 ring-white/10',
        className,
      )}
    >      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
        {floors.map((f) => (
          <button
            key={f}
            onClick={() => setFloor(f)}
            className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
              floor === f
                ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                : 'bg-white/5 text-muted hover:bg-white/10'
            }`}
          >
            Floor {f}
          </button>
        ))}
        <button
          onClick={() => setHeatOn((v) => !v)}
          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
            heatOn
              ? 'bg-critical/20 text-critical ring-1 ring-critical/40'
              : 'bg-white/5 text-muted hover:bg-white/10'
          }`}
        >
          Heatmap
        </button>
      </div>

      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <filter id="pathGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="heatGlow">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <radialGradient id="heatGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff453a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff453a" stopOpacity="0" />
          </radialGradient>
          <pattern id="floorGrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect
            x={slabX}
            y={slabY}
            width={slabW}
            height={slabH}
            rx={12}
            fill="#121214"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={2}
          />
          <rect x={slabX} y={slabY} width={slabW} height={slabH} fill="url(#floorGrid)" />

          {/* Heatmap blobs under rooms */}
          {heatOn &&
            floorNodes.map((n) => {
              const score = rooms[n.id]?.hazard?.score ?? 0;
              if (score < 0.12) return null;
              const size = planSize(n.type, n.capacity);
              const r = Math.max(size.w, size.h) * (0.55 + score * 0.5);
              return (
                <circle
                  key={`heat-${n.id}`}
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={hazardColor(rooms[n.id]?.hazard?.level ?? 'safe')}
                  opacity={0.12 + score * 0.35}
                  filter="url(#heatGlow)"
                />
              );
            })}

          {floorEdges.map((e) => {
            const a = nodeMap[e.source];
            const b = nodeMap[e.target];
            if (!a || !b) return null;
            const sameFloor = a.floor === floor && b.floor === floor;
            return (
              <g key={`${e.source}-${e.target}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={sameFloor ? '#3a3a3c' : '#2c2c2e'}
                  strokeWidth={sameFloor ? 20 : 6}
                  strokeLinecap="round"
                  opacity={0.7}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#1c1c1e"
                  strokeWidth={sameFloor ? 12 : 3}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {activePaths.map(({ id, path }) => {
            const pts = path
              .map((nid) => nodeMap[nid])
              .filter((n): n is BuildingNode => !!n && n.floor === floor);
            if (pts.length < 2) return null;
            const isSelected = selected === id;
            const worst = path.reduce((lvl, nid) => {
              const h = rooms[nid]?.hazard?.level;
              const score =
                h === 'critical' || rooms[nid]?.hazard?.blocked || rooms[nid]?.on_fire
                  ? 4
                  : h === 'danger'
                    ? 3
                    : h === 'warning'
                      ? 2
                      : 1;
              return Math.max(lvl, score);
            }, 1);
            const stroke = worst >= 4 ? '#ff453a' : worst >= 2 ? '#ff9f0a' : '#5ac8fa';
            const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            return (
              <g key={`path-${id}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? 10 : 6}
                  strokeOpacity={isSelected ? 0.4 : 0.12}
                  strokeLinecap="round"
                  filter="url(#pathGlow)"
                />
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? 3.5 : 2}
                  strokeOpacity={isSelected ? 1 : 0.5}
                  strokeLinecap="round"
                  className="path-dash"
                  filter="url(#pathGlow)"
                />
              </g>
            );
          })}

          {floorNodes.map((n) => {
            const room = rooms[n.id];
            const size = planSize(n.type, n.capacity);
            const level = room?.hazard?.level || 'safe';
            const tint = n.blocked ? '#636366' : heatOn ? hazardColor(level) : nodeTypeColor(n.type);
            const typeCol = nodeTypeColor(n.type);
            const isSel = selected === n.id;
            const led = room?.led_color || 'green';
            const fill =
              n.type === 'exit'
                ? '#0f2e1c'
                : n.type === 'stairs'
                  ? '#241830'
                  : n.type === 'corridor'
                    ? '#1c1c1e'
                    : '#141416';
            return (
              <g
                key={n.id}
                transform={`translate(${n.x - size.w / 2}, ${n.y - size.h / 2})`}
                data-node="1"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(n.id);
                }}
                className="cursor-pointer"
              >
                <rect
                  width={size.w}
                  height={size.h}
                  rx={n.type === 'corridor' ? 4 : 8}
                  fill={fill}
                  stroke={isSel ? '#5ac8fa' : tint}
                  strokeWidth={isSel ? 2.8 : 1.6}
                  opacity={n.blocked ? 0.45 : 1}
                />
                {/* Type accent bar */}
                <rect x={0} y={0} width={5} height={size.h} rx={2} fill={typeCol} opacity={0.9} />
                {heatOn && (room?.hazard?.score ?? 0) > 0.15 && (
                  <rect
                    width={size.w}
                    height={size.h}
                    rx={8}
                    fill={tint}
                    opacity={0.15 + (room?.hazard?.score ?? 0) * 0.35}
                  />
                )}
                {/* Occupancy fill */}
                {(room?.occupancy ?? 0) > 0 && (
                  <rect
                    x={6}
                    y={size.h - 10}
                    width={Math.max(4, (size.w - 12) * Math.min(1, (room?.occupancy ?? 0) / Math.max(1, n.capacity)))}
                    height={4}
                    rx={2}
                    fill="#5ac8fa"
                    opacity={0.85}
                  />
                )}
                {(room?.occupancy ?? 0) > 0 && (
                  <text
                    x={size.w - 8}
                    y={14}
                    textAnchor="end"
                    fill="#5ac8fa"
                    fontSize={8}
                    fontFamily="JetBrains Mono"
                  >
                    {room?.occupancy}
                  </text>
                )}
                {/* Selected room route label */}
                {isSel && routes[n.id]?.found && (
                  <text
                    x={size.w / 2}
                    y={size.h - 14}
                    textAnchor="middle"
                    fill="#ffd60a"
                    fontSize={7}
                    fontFamily="JetBrains Mono"
                  >
                    → {routes[n.id].exit_id ?? 'exit'}
                  </text>
                )}
                {room?.on_fire && (
                  <rect width={size.w} height={size.h} rx={8} fill="#ff453a" opacity={0.3}>
                    <animate attributeName="opacity" values="0.18;0.42;0.18" dur="0.7s" repeatCount="indefinite" />
                  </rect>
                )}
                {n.type === 'stairs' &&
                  [0, 1, 2, 3, 4].map((step) => (
                    <rect
                      key={step}
                      x={14}
                      y={10 + step * 10}
                      width={size.w - 28}
                      height={7}
                      rx={1}
                      fill="#bf5af2"
                      opacity={0.35 + step * 0.08}
                    />
                  ))}
                {n.type === 'exit' && (
                  <>
                    <rect
                      x={size.w * 0.18}
                      y={size.h - 10}
                      width={size.w * 0.64}
                      height={6}
                      rx={2}
                      fill="#30d158"
                    />
                    <text
                      x={size.w / 2}
                      y={14}
                      textAnchor="middle"
                      fill="#30d158"
                      fontSize={8}
                      fontWeight={700}
                      fontFamily="Outfit, sans-serif"
                    >
                      EXIT
                    </text>
                  </>
                )}
                <circle cx={14} cy={14} r={3.5} fill={ledColor(led)}>
                  {led === 'pulsing_red' && (
                    <animate attributeName="opacity" values="1;0.25;1" dur="0.55s" repeatCount="indefinite" />
                  )}
                </circle>
                <text
                  x={size.w / 2 + 2}
                  y={size.h / 2 - 1}
                  textAnchor="middle"
                  fill="#f5f5f7"
                  fontSize={9}
                  fontWeight={600}
                  fontFamily="Outfit, sans-serif"
                >
                  {n.name}
                </text>
                <text
                  x={size.w / 2 + 2}
                  y={size.h / 2 + 12}
                  textAnchor="middle"
                  fill="#8e8e93"
                  fontSize={7.5}
                  fontFamily="JetBrains Mono"
                >
                  {room
                    ? `${Math.round(room.temperature)}° · ${Math.round(room.smoke)}%`
                    : n.type.toUpperCase()}
                </text>
              </g>
            );
          })}

          {people
            .filter((p) => p.floor === floor && p.status !== 'evacuated')
            .map((p) => {
              const col =
                p.status === 'trapped' ? '#ff453a' : p.status === 'evacuating' ? '#5ac8fa' : '#d1d1d6';
              const heading = p.heading ?? 0;
              const noseX = p.x + Math.cos(heading) * 6;
              const noseY = p.y + Math.sin(heading) * 6;
              return (
                <g key={p.id}>
                  <circle cx={p.x} cy={p.y} r={5.5} fill={col} opacity={0.15} />
                  <circle cx={p.x} cy={p.y} r={3} fill={col} />
                  {p.status === 'evacuating' && (
                    <line x1={p.x} y1={p.y} x2={noseX} y2={noseY} stroke={col} strokeWidth={1.5} strokeLinecap="round" />
                  )}
                </g>
              );
            })}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
        {[
          { c: '#5ac8fa', l: 'Room' },
          { c: '#8e8e93', l: 'Corridor' },
          { c: '#bf5af2', l: 'Stairs' },
          { c: '#30d158', l: 'Exit' },
        ].map((x) => (
          <span
            key={x.l}
            className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white/75 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c }} />
            {x.l}
          </span>
        ))}
      </div>

      {selected && rooms[selected] && (
        <div className="absolute bottom-3 right-3 max-w-xs rounded-2xl bg-black/70 p-3 text-xs ring-1 ring-white/12 backdrop-blur-xl">
          <div className="font-semibold tracking-tight text-white">{nodeMap[selected]?.name}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
            <span>Temp {rooms[selected].temperature}°C</span>
            <span>Humidity {rooms[selected].humidity ?? 40}%</span>
            <span>Smoke {rooms[selected].smoke}%</span>
            <span>Gas {Math.round(rooms[selected].gas ?? 0)}</span>
            <span>Intensity {((rooms[selected].fire_intensity ?? 0) * 100).toFixed(0)}%</span>
            <span>Flame {rooms[selected].flame ? 'YES' : 'no'}</span>
            <span>Occ {rooms[selected].occupancy}</span>
            <span>Hazard {rooms[selected].hazard?.score?.toFixed(2) ?? '—'}</span>
            <span className="uppercase">{rooms[selected].hazard?.level ?? 'safe'}</span>
            <span>{rooms[selected].device_id ?? 'no device'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
