import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useSimStore } from '@/stores/simStore';
import { hazardColor, nodeTypeColor } from '@/lib/utils';
import type { BuildingNode, NodeType, RoomState } from '@/types';

const FLOOR_H = 3.6;
const WALL_H = 1.45;
const WALL_T = 0.09;

function toWorld(x: number, y: number, floor: number) {
  return {
    x: (x - 500) / 38,
    y: floor * FLOOR_H,
    z: (y - 300) / 38,
  };
}

function footprint(type: NodeType, capacity: number): [number, number] {
  switch (type) {
    case 'corridor':
      return [4.6, 1.45];
    case 'stairs':
      return [2.35, 2.35];
    case 'exit':
      return [1.9, 1.25];
    default: {
      const s = Math.min(5.4, Math.max(2.5, 2.2 + capacity * 0.055));
      return [s, s * 0.9];
    }
  }
}

function typeWallColor(type: NodeType): string {
  switch (type) {
    case 'corridor':
      return '#3a3a3c';
    case 'stairs':
      return '#5e3a7a';
    case 'exit':
      return '#1b4332';
    default:
      return '#4a4a4e';
  }
}

function FireFx({ intensity }: { intensity: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((child, i) => {
      const m = child as THREE.Mesh;
      const flicker = 0.75 + Math.sin(t * (7 + i * 2.1) + i) * 0.28;
      m.scale.set(flicker, 0.9 + Math.abs(Math.sin(t * 5 + i)) * 0.45, flicker);
      m.position.y = 0.2 + Math.abs(Math.sin(t * 4.2 + i * 0.7)) * 0.35 * intensity;
      m.rotation.y = Math.sin(t * 2 + i) * 0.2;
    });
  });

  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i % 2) * 0.18 - 0.09, 0.25, (i > 1 ? 0.12 : -0.1)]}>
          <coneGeometry args={[0.16 + i * 0.04, 0.55 + i * 0.12, 7]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#ff9f0a' : '#ff453a'}
            emissive={i % 2 === 0 ? '#ff9f0a' : '#ff453a'}
            emissiveIntensity={2.8}
            transparent
            opacity={0.92}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial
          color="#1c1c1e"
          emissive="#ff453a"
          emissiveIntensity={0.6}
          transparent
          opacity={0.55}
        />
      </mesh>
      <pointLight color="#ff9f0a" intensity={2 + intensity * 3} distance={6} decay={2} />
    </group>
  );
}

function RoomSpace({
  node,
  room,
  selected,
  onSelect,
  showHeat,
}: {
  node: BuildingNode;
  room?: RoomState;
  selected: boolean;
  onSelect: () => void;
  showHeat: boolean;
}) {
  const hazard = room?.hazard?.score ?? 0;
  const onFire = room?.on_fire ?? false;
  const intensity = room?.fire_intensity ?? 0;
  const smoke = room?.smoke ?? 0;
  const level =
    hazard >= 0.85 ? 'critical' : hazard >= 0.55 ? 'danger' : hazard >= 0.25 ? 'warning' : 'safe';
  const tint = hazardColor(level);
  const typeAccent = nodeTypeColor(node.type);
  const [w, d] = footprint(node.type, node.capacity);
  const pos = toWorld(node.x, node.y, node.floor);
  const hw = w / 2;
  const hd = d / 2;

  const floorTint = showHeat && hazard > 0.08 ? tint : node.type === 'exit' ? '#143528' : '#2c2c2e';
  const carpet =
    node.type === 'corridor'
      ? '#636366'
      : node.type === 'stairs'
        ? '#3a2a4a'
        : node.type === 'exit'
          ? '#1f6f45'
          : '#3a3a3c';

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Raised floor plate */}
      <RoundedBox args={[w + 0.12, 0.1, d + 0.12]} radius={0.04} position={[0, 0.05, 0]} receiveShadow>
        <meshStandardMaterial
          color={floorTint}
          roughness={0.85}
          metalness={0.05}
          emissive={onFire ? '#ff453a' : selected ? '#5ac8fa' : showHeat && hazard > 0.25 ? tint : '#000'}
          emissiveIntensity={onFire ? 0.35 : selected ? 0.25 : showHeat ? hazard * 0.45 : 0}
        />
      </RoundedBox>

      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[w * 0.9, 0.03, d * 0.9]} />
        <meshStandardMaterial
          color={showHeat && hazard > 0.15 ? tint : carpet}
          roughness={0.95}
          transparent
          opacity={node.blocked ? 0.4 : 0.95}
        />
      </mesh>

      {/* Type badge strip on floor edge */}
      <mesh position={[0, 0.14, -hd + 0.06]}>
        <boxGeometry args={[w * 0.5, 0.04, 0.08]} />
        <meshStandardMaterial color={typeAccent} emissive={typeAccent} emissiveIntensity={0.55} />
      </mesh>

      {/* Walls — rooms solid, corridors glassier */}
      {(
        [
          [0, WALL_H / 2, -hd, w, WALL_H, WALL_T],
          [0, WALL_H / 2, hd, w, WALL_H, WALL_T],
          [-hw, WALL_H / 2, 0, WALL_T, WALL_H, d],
          [hw, WALL_H / 2, 0, WALL_T, WALL_H, d],
        ] as const
      ).map((a, i) => (
        <mesh key={i} position={[a[0], a[1], a[2]]} castShadow receiveShadow>
          <boxGeometry args={[a[3], a[4], a[5]]} />
          <meshStandardMaterial
            color={typeWallColor(node.type)}
            roughness={node.type === 'corridor' ? 0.35 : 0.72}
            metalness={node.type === 'corridor' ? 0.35 : 0.08}
            transparent
            opacity={node.type === 'corridor' ? 0.28 : node.type === 'exit' ? 0.55 : 0.88}
          />
        </mesh>
      ))}

      {/* EXIT portal */}
      {node.type === 'exit' && (
        <group position={[0, WALL_H * 0.45, hd + 0.04]}>
          <RoundedBox args={[w * 0.55, WALL_H * 0.9, 0.08]} radius={0.04}>
            <meshStandardMaterial
              color="#30d158"
              emissive="#30d158"
              emissiveIntensity={1.4}
              transparent
              opacity={0.85}
            />
          </RoundedBox>
          <Text position={[0, 0, 0.06]} fontSize={0.18} color="#052e16" anchorX="center" fontWeight={700}>
            EXIT
          </Text>
          <pointLight color="#30d158" intensity={1.2} distance={4} />
        </group>
      )}

      {/* Stairs — helical-ish step stack + rail */}
      {node.type === 'stairs' && (
        <group>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <mesh
              key={step}
              position={[-0.35 + step * 0.12, 0.14 + step * 0.2, -hd + 0.3 + step * 0.28]}
              castShadow
            >
              <boxGeometry args={[w * 0.55, 0.1, 0.28]} />
              <meshStandardMaterial color="#8e6bab" roughness={0.55} metalness={0.15} />
            </mesh>
          ))}
          <mesh position={[hw - 0.15, 0.9, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
            <meshStandardMaterial color="#bf5af2" metalness={0.6} roughness={0.3} />
          </mesh>
          <Text position={[0, WALL_H + 0.15, 0]} fontSize={0.16} color="#e9d5ff" anchorX="center">
            STAIRS
          </Text>
        </group>
      )}

      {/* Corridor chevrons */}
      {node.type === 'corridor' && (
        <>
          {[-0.8, 0, 0.8].map((ox) => (
            <mesh key={ox} position={[ox, 0.15, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
              <ringGeometry args={[0.12, 0.2, 3]} />
              <meshBasicMaterial color="#5ac8fa" transparent opacity={0.35} />
            </mesh>
          ))}
        </>
      )}

      {selected && (
        <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.52, Math.max(w, d) * 0.6, 48]} />
          <meshBasicMaterial color="#5ac8fa" transparent opacity={0.85} />
        </mesh>
      )}

      {onFire && (
        <group position={[0, 0.2, 0]}>
          <FireFx intensity={Math.max(0.4, intensity)} />
        </group>
      )}

      {smoke > 18 && (
        <mesh position={[0, 1.0 + smoke / 180, 0]}>
          <sphereGeometry args={[0.5 + smoke / 200, 16, 16]} />
          <meshStandardMaterial
            color="#8e8e93"
            transparent
            opacity={0.1 + smoke / 450}
            depthWrite={false}
          />
        </mesh>
      )}

      <Text
        position={[0, WALL_H + (node.type === 'stairs' ? 0.45 : 0.28), 0]}
        fontSize={0.2}
        color="#f5f5f7"
        anchorX="center"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {node.name}
      </Text>
    </group>
  );
}

function PersonFigure({
  x,
  z,
  floor,
  status,
  heading,
}: {
  x: number;
  z: number;
  floor: number;
  status: string;
  heading: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const color =
    status === 'evacuating' ? '#5ac8fa' : status === 'trapped' ? '#ff453a' : '#d1d1d6';
  const pos = toWorld(x, z, floor);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, pos.x, 0.18);
    ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, pos.z, 0.18);
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, -heading + Math.PI / 2, 0.12);
    if (status === 'evacuating') {
      ref.current.position.y = pos.y + 0.1 + Math.sin(clock.elapsedTime * 8 + x) * 0.03;
    } else {
      ref.current.position.y = pos.y + 0.1;
    }
  });

  return (
    <group ref={ref} position={[pos.x, pos.y + 0.1, pos.z]} rotation={[0, -heading + Math.PI / 2, 0]}>
      {/* Soft status glow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.32, 6, 10]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.1, 14, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      {/* Arms hint */}
      <mesh position={[0.16, 0.48, 0]} rotation={[0, 0, 0.4]}>
        <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.16, 0.48, 0]} rotation={[0, 0, -0.4]}>
        <capsuleGeometry args={[0.035, 0.16, 4, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function SmokePlumes() {
  const rooms = useSimStore((s) => s.state?.rooms);
  const nodes = useSimStore((s) => s.state?.building.nodes);
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((c, i) => {
      const base = (c.userData.baseY as number) ?? 1.5;
      const phase = (t * 0.4 + i * 0.55) % 3.2;
      c.position.y = base + phase;
      c.position.x = (c.userData.baseX as number) + Math.sin(t * 0.6 + i) * 0.15;
      const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = Math.max(0.02, 0.22 * (1 - phase / 3.2));
      const s = 1 + phase * 0.25;
      c.scale.setScalar(s);
    });
  });

  const plumes = useMemo(() => {
    if (!rooms || !nodes) return [];
    return nodes
      .filter((n) => (rooms[n.id]?.smoke ?? 0) > 15)
      .flatMap((n) => {
        const p = toWorld(n.x, n.y, n.floor);
        const smoke = rooms[n.id].smoke;
        return [0, 1, 2, 3].map((i) => ({
          id: `${n.id}-${i}`,
          x: p.x + (i - 1.5) * 0.28,
          z: p.z + ((i % 2) - 0.5) * 0.25,
          baseY: p.y + 1.1 + i * 0.15,
          r: 0.28 + smoke / 260 + i * 0.06,
        }));
      });
  }, [rooms, nodes]);

  return (
    <group ref={ref}>
      {plumes.map((p) => (
        <mesh key={p.id} position={[p.x, p.baseY, p.z]} userData={{ baseY: p.baseY, baseX: p.x }}>
          <sphereGeometry args={[p.r, 12, 12]} />
          <meshStandardMaterial color="#aeaeb2" transparent opacity={0.16} depthWrite={false} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function FloorPlate({ floor, nodes }: { floor: number; nodes: BuildingNode[] }) {
  const floorNodes = nodes.filter((n) => n.floor === floor);
  if (!floorNodes.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  floorNodes.forEach((n) => {
    const p = toWorld(n.x, n.y, 0);
    const [w, d] = footprint(n.type, n.capacity);
    minX = Math.min(minX, p.x - w / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    minZ = Math.min(minZ, p.z - d / 2);
    maxZ = Math.max(maxZ, p.z + d / 2);
  });

  const pad = 1.4;
  const w = maxX - minX + pad * 2;
  const d = maxZ - minZ + pad * 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const y = floor * FLOOR_H;

  return (
    <group>
      <RoundedBox args={[w, 0.14, d]} radius={0.06} position={[cx, y - 0.08, cz]} receiveShadow>
        <meshStandardMaterial color="#1c1c1e" roughness={0.9} metalness={0.08} />
      </RoundedBox>
      <mesh position={[cx, y + 0.01, cz]}>
        <boxGeometry args={[w - 0.2, 0.02, d - 0.2]} />
        <meshStandardMaterial color="#2c2c2e" roughness={0.95} transparent opacity={0.7} />
      </mesh>
      <Text
        position={[cx - w / 2 + 0.9, y + 0.12, cz - d / 2 + 0.55]}
        fontSize={0.26}
        color="#8e8e93"
        anchorX="left"
        fontWeight={600}
      >
        {`LEVEL ${floor}`}
      </Text>
    </group>
  );
}

function pathTone(
  rooms: Record<string, RoomState>,
  path: string[],
  found: boolean,
): { color: string; opacity: number } {
  if (!found) return { color: '#ff453a', opacity: 0.55 };
  const worst = path.reduce((lvl, id) => {
    const h = rooms[id]?.hazard?.level;
    const score =
      h === 'critical' || rooms[id]?.hazard?.blocked
        ? 4
        : h === 'danger'
          ? 3
          : h === 'warning'
            ? 2
            : 1;
    return Math.max(lvl, score);
  }, 1);
  if (worst >= 4 || path.some((id) => rooms[id]?.hazard?.blocked || rooms[id]?.on_fire)) {
    return { color: '#ff453a', opacity: 0.85 };
  }
  if (worst >= 2) return { color: '#ff9f0a', opacity: 0.8 };
  return { color: '#5ac8fa', opacity: 0.78 };
}

function PathTubes({ emphasize }: { emphasize: boolean }) {
  const routes = useSimStore((s) => s.state?.routes);
  const rooms = useSimStore((s) => s.state?.rooms ?? {});
  const selected = useSimStore((s) => s.selectedNodeId);
  const nodes = useSimStore((s) => s.state?.building.nodes);
  const nodeMap = useMemo(
    () => Object.fromEntries((nodes ?? []).map((n) => [n.id, n])),
    [nodes],
  );
  const pulse = useRef(0);
  const matRefs = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame(({ clock }) => {
    pulse.current = (Math.sin(clock.elapsedTime * 3.2) + 1) * 0.5;
    matRefs.current.forEach((m, i) => {
      if (!m) return;
      m.emissiveIntensity = 0.9 + pulse.current * (emphasize ? 1.4 : 0.7) + (i % 3) * 0.05;
    });
  });

  const segments = useMemo(() => {
    if (!routes) return [] as { key: string; a: THREE.Vector3; b: THREE.Vector3; color: string; opacity: number; primary: boolean }[];
    const entries = Object.entries(routes).filter(([, r]) => r.found && r.path.length > 1);
    const prioritized = [
      ...entries.filter(([id]) => id === selected),
      ...entries.filter(([id]) => id !== selected),
    ].slice(0, emphasize ? 24 : 14);

    const out: { key: string; a: THREE.Vector3; b: THREE.Vector3; color: string; opacity: number; primary: boolean }[] = [];
    prioritized.forEach(([roomId, r], ri) => {
      const tone = pathTone(rooms, r.path, r.found);
      const primary = roomId === selected || emphasize;
      const pts = r.path
        .map((id) => nodeMap[id])
        .filter((n): n is BuildingNode => !!n)
        .map((n) => {
          const p = toWorld(n.x, n.y, n.floor);
          return new THREE.Vector3(p.x, p.y + 0.35, p.z);
        });
      for (let i = 0; i < pts.length - 1; i++) {
        out.push({
          key: `${roomId}-${i}-${ri}`,
          a: pts[i],
          b: pts[i + 1],
          color: tone.color,
          opacity: primary ? tone.opacity : tone.opacity * 0.45,
          primary,
        });
      }
    });
    return out;
  }, [routes, nodeMap, rooms, selected, emphasize]);

  matRefs.current = [];

  return (
    <>
      {segments.map((s, idx) => {
        const mid = s.a.clone().lerp(s.b, 0.5);
        const dir = s.b.clone().sub(s.a);
        const len = dir.length();
        if (len < 0.01) return null;
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        const radius = s.primary ? 0.055 : 0.035;
        return (
          <group key={s.key} position={mid.toArray()} quaternion={quat}>
            <mesh>
              <cylinderGeometry args={[radius, radius, len, 8]} />
              <meshStandardMaterial
                ref={(el) => {
                  if (el) matRefs.current[idx] = el;
                }}
                color={s.color}
                emissive={s.color}
                emissiveIntensity={1.15}
                transparent
                opacity={s.opacity}
              />
            </mesh>
            <mesh>
              <cylinderGeometry args={[radius * 2.2, radius * 2.2, len, 8]} />
              <meshBasicMaterial color={s.color} transparent opacity={s.primary ? 0.16 : 0.07} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export function Scene({ showHeat, emphasizePaths = false }: { showHeat: boolean; emphasizePaths?: boolean }) {
  const state = useSimStore((s) => s.state);
  const selected = useSimStore((s) => s.selectedNodeId);
  const setSelected = useSimStore((s) => s.setSelectedNode);
  const nodes = state?.building.nodes ?? [];
  const rooms = state?.rooms ?? {};
  const people = state?.people ?? [];
  const floors = useMemo(() => [...new Set(nodes.map((n) => n.floor))].sort(), [nodes]);

  return (
    <>
      <hemisphereLight args={['#f5f5f7', '#1c1c1e', 0.45]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={70}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />
      <directionalLight position={[-12, 10, -8]} intensity={0.2} color="#ff9f0a" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0a0a0c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1, 0.01, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color="#141416" roughness={0.85} metalness={0.1} />
      </mesh>

      <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={42} blur={2.8} far={20} />

      {floors.map((f) => (
        <FloorPlate key={f} floor={f} nodes={nodes} />
      ))}

      {nodes.map((n) => (
        <RoomSpace
          key={n.id}
          node={n}
          room={rooms[n.id]}
          selected={selected === n.id}
          onSelect={() => setSelected(n.id)}
          showHeat={showHeat}
        />
      ))}

      {people
        .filter((p) => p.status !== 'evacuated')
        .slice(0, 400)
        .map((p) => (
          <PersonFigure
            key={p.id}
            x={p.x}
            z={p.y}
            floor={p.floor}
            status={p.status}
            heading={p.heading ?? 0}
          />
        ))}

      <SmokePlumes />
      <PathTubes emphasize={emphasizePaths} />
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
        maxDistance={55}
        target={[1, 2.8, 0]}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

