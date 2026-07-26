import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Badge } from '@/components/ui';
import { FloatingSimToolbar } from '@/components/SimulationControls';
import { SelectionPanel } from '@/components/SelectionPanel';
import { useSimStore } from '@/stores/simStore';
import { Scene } from '@/pages/twin/TwinScene';

export function TwinPage() {
  const connect = useSimStore((s) => s.connect);
  const fetchState = useSimStore((s) => s.fetchState);
  const [showHeat, setShowHeat] = useState(true);

  useEffect(() => {
    fetchState().catch(() => undefined);
    connect();
  }, [connect, fetchState]);

  return (
    <div className="relative flex h-full min-h-0 gap-3">
      <div className="relative min-h-0 min-w-0 flex-[7] overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#050507] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <Canvas
          shadows
          camera={{ position: [17, 15, 21], fov: 40, near: 0.1, far: 120 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <color attach="background" args={['#050507']} />
          <fog attach="fog" args={['#050507', 30, 68]} />
          <Scene showHeat={showHeat} />
        </Canvas>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge tone="accent" pulse>
            3D Twin Live
          </Badge>
          <button
            type="button"
            onClick={() => setShowHeat((v) => !v)}
            className="pointer-events-auto rounded-full bg-black/50 px-3 py-1 text-[10px] font-semibold text-white/80 ring-1 ring-white/15 backdrop-blur hover:bg-black/70"
          >
            Heatmap {showHeat ? 'On' : 'Off'}
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          {[
            { c: '#5ac8fa', l: 'Safe path' },
            { c: '#ff9f0a', l: 'Warning' },
            { c: '#ff453a', l: 'Blocked / Fire' },
            { c: '#30d158', l: 'Exit' },
          ].map((x) => (
            <span
              key={x.l}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white/75 backdrop-blur"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: x.c }} />
              {x.l}
            </span>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-3">
          <FloatingSimToolbar />
        </div>
      </div>

      <div className="hidden w-[22%] min-w-[260px] max-w-[340px] shrink-0 lg:block">
        <SelectionPanel className="h-full" />
      </div>
    </div>
  );
}
