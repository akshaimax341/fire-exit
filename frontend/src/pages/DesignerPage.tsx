import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Connection,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Panel, Badge } from '@/components/ui';
import { useSimStore } from '@/stores/simStore';
import { useAuthStore } from '@/stores/authStore';
import {
  useDesignerStore,
  type DesignerData,
  type DesignerNode,
} from '@/stores/designerStore';
import type { BuildingNode, NodeType } from '@/types';
import { Plus, Save, Trash2, Layers, ArrowUpDown } from 'lucide-react';
import { nodeTypeColor } from '@/lib/utils';

const MAX_FLOORS = 12;

function BuildingNodeView({ data, selected }: NodeProps<DesignerNode>) {
  const c = nodeTypeColor(data.nodeType);
  return (
    <div
      className={
        selected
          ? 'min-w-[128px] rounded-2xl px-3 py-2.5 text-xs ring-2 ring-accent'
          : 'min-w-[128px] rounded-2xl px-3 py-2.5 text-xs'
      }
      style={{
        background: 'rgba(20,20,24,0.92)',
        border: `1px solid ${c}`,
        boxShadow: selected ? `0 0 20px ${c}55` : '0 12px 32px rgba(0,0,0,0.45)',
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-0 !bg-accent" />
      <div className="font-semibold tracking-tight text-slate-100">{data.label}</div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: c }}>
        {data.nodeType} · Floor {data.floor}
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/3 rounded-full" style={{ background: c }} />
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-0 !bg-accent" />
    </div>
  );
}

const nodeTypes = { building: BuildingNodeView };

function layoutSignature(nodes: BuildingNode[], edges: { source: string; target: string }[]) {
  return [
    nodes.map((n) => `${n.id}:${n.x}:${n.y}:${n.type}:${n.floor}`).join('|'),
    edges.map((e) => `${e.source}->${e.target}`).join('|'),
  ].join('::');
}

function DesignerCanvas() {
  const state = useSimStore((s) => s.state);
  const fetchState = useSimStore((s) => s.fetchState);
  const updateLayout = useSimStore((s) => s.updateLayout);
  const canEdit = useAuthStore((s) => s.hasRole('admin', 'operator'));

  const nodes = useDesignerStore((s) => s.nodes);
  const edges = useDesignerStore((s) => s.edges);
  const floorCount = useDesignerStore((s) => s.floorCount);
  const activeFloor = useDesignerStore((s) => s.activeFloor);
  const dirty = useDesignerStore((s) => s.dirty);
  const lastSig = useDesignerStore((s) => s.lastSig);
  const hasDraft = useDesignerStore((s) => s.hasDraft);
  const setNodes = useDesignerStore((s) => s.setNodes);
  const setEdges = useDesignerStore((s) => s.setEdges);
  const setFloorCount = useDesignerStore((s) => s.setFloorCount);
  const setActiveFloor = useDesignerStore((s) => s.setActiveFloor);
  const markDirty = useDesignerStore((s) => s.markDirty);
  const replaceDraft = useDesignerStore((s) => s.replaceDraft);
  const clearDirty = useDesignerStore((s) => s.clearDirty);

  const [selectedType, setSelectedType] = useState<NodeType>('room');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchState().catch(() => undefined);
  }, [fetchState]);

  // Hydrate from live building only when we have no unsaved draft
  useEffect(() => {
    const building = state?.building;
    if (!building?.nodes.length) return;
    const sig = layoutSignature(building.nodes, building.edges);

    if (dirty || (hasDraft && nodes.length > 0 && lastSig === sig)) {
      // Keep local draft — do not reset on navigation / websocket ticks
      if (!lastSig && !dirty) {
        useDesignerStore.setState({ lastSig: sig });
      }
      return;
    }
    if (sig === lastSig && hasDraft && nodes.length > 0) return;

    const maxFloor = Math.max(0, ...building.nodes.map((n) => n.floor));
    const nextFloorCount = Math.max(maxFloor + 1, 1);
    const floor = useDesignerStore.getState().activeFloor;

    replaceDraft({
      nodes: building.nodes.map((n) => ({
        id: n.id,
        type: 'building',
        position: { x: n.x, y: n.y },
        data: {
          label: n.name,
          nodeType: n.type,
          floor: n.floor,
          capacity: n.capacity,
        },
        hidden: n.floor !== Math.min(floor, maxFloor),
      })),
      edges: building.edges.map((e, i) => ({
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        style: { stroke: 'rgba(90,200,250,0.45)', strokeWidth: 2 },
        animated: false,
      })),
      floorCount: nextFloorCount,
      activeFloor: Math.min(floor, maxFloor),
      dirty: false,
      lastSig: sig,
    });
  }, [state?.building, dirty, hasDraft, nodes.length, lastSig, replaceDraft]);

  // Floor visibility
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        hidden: n.data.floor !== activeFloor,
        selected: n.data.floor === activeFloor ? n.selected : false,
      })),
    );
  }, [activeFloor, setNodes]);

  const floors = useMemo(() => Array.from({ length: floorCount }, (_, i) => i), [floorCount]);

  const floorStats = useMemo(() => {
    const counts: Record<number, number> = {};
    floors.forEach((f) => {
      counts[f] = 0;
    });
    nodes.forEach((n) => {
      counts[n.data.floor] = (counts[n.data.floor] ?? 0) + 1;
    });
    return counts;
  }, [nodes, floors]);

  const displayEdges = useMemo(() => {
    const floorOf = Object.fromEntries(nodes.map((n) => [n.id, n.data.floor]));
    return edges.map((e) => {
      const sf = floorOf[e.source];
      const tf = floorOf[e.target];
      const sameFloor = sf === activeFloor && tf === activeFloor;
      const verticalTouch = sf !== tf && (sf === activeFloor || tf === activeFloor);
      return {
        ...e,
        hidden: !(sameFloor || verticalTouch),
      };
    });
  }, [edges, nodes, activeFloor]);

  const selectedOnFloor = useMemo(
    () => nodes.filter((n) => n.selected && n.data.floor === activeFloor),
    [nodes, activeFloor],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<DesignerNode>[]) => {
      markDirty();
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [markDirty, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      markDirty();
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [markDirty, setEdges],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return;
      if (src.data.floor !== tgt.data.floor) {
        if (src.data.nodeType !== 'stairs' && tgt.data.nodeType !== 'stairs') {
          setError('Cross-floor links require a stairs node on at least one side.');
          return;
        }
      }
      markDirty();
      setError('');
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            style: {
              stroke: src.data.floor !== tgt.data.floor ? '#bf5af2' : '#5ac8fa',
              strokeWidth: 2,
            },
            animated: src.data.floor !== tgt.data.floor,
            label: src.data.floor !== tgt.data.floor ? 'vertical' : undefined,
          },
          eds,
        ),
      );
    },
    [setEdges, nodes, markDirty],
  );

  const addFloor = () => {
    if (!canEdit) return;
    if (floorCount >= MAX_FLOORS) {
      setError(`Maximum ${MAX_FLOORS} floors.`);
      return;
    }
    markDirty();
    const next = floorCount;
    setFloorCount((c) => c + 1);
    setActiveFloor(next);
    setError('');
  };

  const removeFloor = useCallback(
    (floorToRemove?: number) => {
      if (!canEdit) return;
      if (floorCount <= 1) {
        setError('Need at least one floor.');
        return;
      }
      const target = floorToRemove ?? activeFloor;
      markDirty();

      const removedIds = new Set(nodes.filter((n) => n.data.floor === target).map((n) => n.id));

      setNodes((nds) =>
        nds
          .filter((n) => n.data.floor !== target)
          .map((n) => ({
            ...n,
            data: {
              ...n.data,
              floor: n.data.floor > target ? n.data.floor - 1 : n.data.floor,
            },
          })),
      );
      setEdges((eds) => eds.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)));

      setFloorCount((c) => c - 1);
      setActiveFloor((f) => {
        if (f > target) return f - 1;
        if (f === target) return Math.max(0, target - 1);
        return f;
      });
      setError(
        removedIds.size > 0
          ? `Deleted floor ${target} and ${removedIds.size} node(s).`
          : `Deleted floor ${target}.`,
      );
    },
    [canEdit, floorCount, activeFloor, nodes, setNodes, setEdges, markDirty, setFloorCount, setActiveFloor],
  );

  const deleteSelected = useCallback(() => {
    if (!canEdit) return;
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    const selectedEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));

    if (selectedIds.size === 0 && selectedEdgeIds.size === 0) {
      setError('Select a node or edge first, or use Delete Floor.');
      return;
    }

    markDirty();
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) =>
      eds.filter((e) => !e.selected && !selectedIds.has(e.source) && !selectedIds.has(e.target)),
    );
    setError(
      selectedIds.size > 0
        ? `Deleted ${selectedIds.size} node(s).`
        : `Deleted ${selectedEdgeIds.size} edge(s).`,
    );
  }, [canEdit, nodes, edges, setNodes, setEdges, markDirty]);

  const addNode = () => {
    if (!canEdit) return;
    markDirty();
    const id = `${selectedType}_${Date.now().toString(36)}`;
    const onFloor = nodes.filter((n) => n.data.floor === activeFloor);
    const label =
      selectedType === 'exit'
        ? `Exit F${activeFloor}-${onFloor.filter((n) => n.data.nodeType === 'exit').length + 1}`
        : selectedType === 'corridor'
          ? `Corridor F${activeFloor}-${onFloor.length + 1}`
          : selectedType === 'stairs'
            ? `Stairs F${activeFloor}-${onFloor.filter((n) => n.data.nodeType === 'stairs').length + 1}`
            : `Room F${activeFloor}-${onFloor.length + 1}`;
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id,
        type: 'building',
        position: { x: 180 + Math.random() * 260, y: 120 + Math.random() * 220 },
        selected: true,
        hidden: false,
        data: {
          label,
          nodeType: selectedType,
          floor: activeFloor,
          capacity: selectedType === 'exit' ? 50 : selectedType === 'corridor' ? 30 : 15,
        },
      },
    ]);
    setError('');
  };

  const moveSelectedToFloor = (targetFloor: number) => {
    if (!canEdit) return;
    if (selectedOnFloor.length === 0) {
      setError('Select node(s) on this floor to move.');
      return;
    }
    markDirty();
    setNodes((nds) =>
      nds.map((n) =>
        n.selected
          ? {
              ...n,
              data: { ...n.data, floor: targetFloor },
              hidden: targetFloor !== activeFloor,
              selected: targetFloor === activeFloor,
            }
          : n,
      ),
    );
    setError('');
  };

  const linkStairsAcrossFloors = () => {
    if (!canEdit) return;
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 1 || selected[0].data.nodeType !== 'stairs') {
      setError('Select exactly one stairs node, then create its twin on the adjacent floor.');
      return;
    }
    const src = selected[0];
    const targetFloor = src.data.floor + 1;
    if (targetFloor >= floorCount) {
      if (floorCount >= MAX_FLOORS) {
        setError('Cannot add another floor.');
        return;
      }
      setFloorCount((c) => Math.max(c, targetFloor + 1));
    }
    markDirty();
    const id = `stairs_${Date.now().toString(36)}`;
    const twin: DesignerNode = {
      id,
      type: 'building',
      position: { x: src.position.x, y: src.position.y },
      data: {
        label: `${src.data.label} (F${targetFloor})`,
        nodeType: 'stairs',
        floor: targetFloor,
        capacity: src.data.capacity,
      },
      hidden: targetFloor !== activeFloor,
    };
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), twin]);
    setEdges((eds) =>
      addEdge(
        {
          id: `vert-${src.id}-${id}`,
          source: src.id,
          target: id,
          style: { stroke: '#bf5af2', strokeWidth: 2 },
          animated: true,
          label: 'vertical',
        },
        eds,
      ),
    );
    setActiveFloor(targetFloor);
    setError('');
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      if (nodes.length < 2) {
        setError('Layout needs at least 2 nodes.');
        return;
      }
      const bNodes: BuildingNode[] = nodes.map((n) => ({
        id: n.id,
        name: String(n.data.label),
        type: n.data.nodeType,
        floor: Number(n.data.floor),
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        capacity: Number(n.data.capacity) || 15,
        blocked: false,
        hazard_score: 0,
        occupancy: 0,
      }));
      const bEdges = edges
        .filter((e) => e.source && e.target)
        .map((e) => ({
          source: e.source,
          target: e.target,
          distance: 10,
        }));
      const maxFloor = Math.max(0, ...bNodes.map((n) => n.floor));
      await updateLayout(bNodes, bEdges);
      setFloorCount(Math.max(maxFloor + 1, floorCount));
      const sig = layoutSignature(bNodes, bEdges);
      clearDirty(sig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy layout');
    } finally {
      setSaving(false);
    }
  };

  const types = useMemo(() => ['room', 'corridor', 'stairs', 'exit'] as NodeType[], []);

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      <Panel title="Toolbox" className="flex w-60 shrink-0 flex-col overflow-y-auto">
        <div className="space-y-3">
          {dirty && (
            <Badge tone="warning">Unsaved draft — kept while you navigate</Badge>
          )}

          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Node Type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={
                  selectedType === t
                    ? 'rounded-xl bg-accent/20 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent ring-1 ring-accent/40'
                    : 'rounded-xl bg-white/5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted hover:bg-white/10'
                }
              >
                <span
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: nodeTypeColor(t) }}
                />
                {t}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Floors
              </span>
              <span className="font-mono text-[10px] text-muted">{floorCount} total</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {floors.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFloor(f)}
                  className={
                    activeFloor === f
                      ? 'rounded-xl bg-accent/20 px-2.5 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/40'
                      : 'rounded-xl bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-white/10'
                  }
                >
                  F{f}
                  <span className="ml-1 font-mono text-[9px] opacity-60">{floorStats[f] ?? 0}</span>
                </button>
              ))}
            </div>
            {canEdit && (
              <div className="mt-2 flex flex-col gap-1.5">
                <Button className="w-full" size="sm" variant="ghost" onClick={addFloor}>
                  <Layers className="h-3.5 w-3.5" /> Add Floor
                </Button>
                <Button
                  className="w-full"
                  size="sm"
                  variant="danger"
                  onClick={() => removeFloor(activeFloor)}
                  disabled={floorCount <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Floor {activeFloor}
                </Button>
              </div>
            )}
          </div>

          {canEdit && selectedOnFloor.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Move selected to
              </div>
              <div className="flex flex-wrap gap-1">
                {floors
                  .filter((f) => f !== activeFloor)
                  .map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => moveSelectedToFloor(f)}
                      className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-semibold text-muted hover:bg-accent/15 hover:text-accent"
                    >
                      F{f}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {canEdit && (
            <>
              <Button className="w-full" size="sm" onClick={addNode}>
                <Plus className="h-3.5 w-3.5" /> Add to Floor {activeFloor}
              </Button>
              <Button className="w-full" size="sm" variant="ghost" onClick={linkStairsAcrossFloors}>
                <ArrowUpDown className="h-3.5 w-3.5" /> Twin Stairs ↑
              </Button>
              <Button className="w-full" size="sm" variant="ghost" onClick={deleteSelected}>
                <Trash2 className="h-3.5 w-3.5" /> Delete Selected
              </Button>
              <p className="text-[9px] text-muted">Shortcut: Delete or Backspace</p>
              <Button className="w-full" size="sm" variant="success" onClick={save} disabled={saving}>
                <Save className="h-3.5 w-3.5" /> {saving ? 'Deploying...' : 'Deploy Layout'}
              </Button>
              {saved && <Badge tone="safe">Layout deployed</Badge>}
            </>
          )}

          {error && <p className="text-[11px] leading-snug text-critical">{error}</p>}

          <p className="text-[10px] leading-relaxed text-muted">
            Your draft is kept when you leave this page. Click{' '}
            <span className="text-accent">Deploy Layout</span> to push it into the live twin.
          </p>
        </div>
      </Panel>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-white/12">
        <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.03] px-3 py-2">
          <Layers className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold text-white">Editing Floor {activeFloor}</span>
          <span className="font-mono text-[10px] text-muted">
            {floorStats[activeFloor] ?? 0} nodes visible
          </span>
          {dirty && <Badge tone="warning">Draft</Badge>}
          <div className="ml-auto flex gap-1">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFloor(f)}
                className={
                  activeFloor === f
                    ? 'rounded-full bg-accent/20 px-2.5 py-0.5 text-[10px] font-semibold text-accent'
                    : 'rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-muted'
                }
              >
                F{f}
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-h-0 flex-1" style={{ background: '#0a0a0c' }}>
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={canEdit ? onConnect : undefined}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            className="h-full w-full"
            defaultEdgeOptions={{ type: 'smoothstep' }}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            onlyRenderVisibleElements
          >
            <Background color="rgba(255,255,255,0.06)" gap={22} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) =>
                nodeTypeColor(String((n.data as DesignerData | undefined)?.nodeType ?? 'room'))
              }
              maskColor="rgba(5,5,7,0.75)"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export function DesignerPage() {
  return (
    <div className="h-full min-h-[480px]">
      <ReactFlowProvider>
        <DesignerCanvas />
      </ReactFlowProvider>
    </div>
  );
}
