import { create } from 'zustand';
import type { Edge, Node } from '@xyflow/react';
import type { NodeType } from '@/types';

export type DesignerData = {
  label: string;
  nodeType: NodeType;
  floor: number;
  capacity: number;
};

export type DesignerNode = Node<DesignerData>;

interface DesignerStore {
  nodes: DesignerNode[];
  edges: Edge[];
  floorCount: number;
  activeFloor: number;
  dirty: boolean;
  lastSig: string;
  hasDraft: boolean;
  setNodes: (nodes: DesignerNode[] | ((prev: DesignerNode[]) => DesignerNode[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setFloorCount: (n: number | ((prev: number) => number)) => void;
  setActiveFloor: (n: number | ((prev: number) => number)) => void;
  markDirty: () => void;
  replaceDraft: (payload: {
    nodes: DesignerNode[];
    edges: Edge[];
    floorCount: number;
    activeFloor?: number;
    dirty?: boolean;
    lastSig?: string;
  }) => void;
  clearDirty: (lastSig: string) => void;
  discardDraft: () => void;
}

function apply<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

export const useDesignerStore = create<DesignerStore>((set, get) => ({
  nodes: [],
  edges: [],
  floorCount: 2,
  activeFloor: 0,
  dirty: false,
  lastSig: '',
  hasDraft: false,

  setNodes: (nodes) =>
    set((s) => ({
      nodes: apply(s.nodes, nodes),
      hasDraft: true,
    })),

  setEdges: (edges) =>
    set((s) => ({
      edges: apply(s.edges, edges),
      hasDraft: true,
    })),

  setFloorCount: (n) => set((s) => ({ floorCount: apply(s.floorCount, n), hasDraft: true })),

  setActiveFloor: (n) => set((s) => ({ activeFloor: apply(s.activeFloor, n) })),

  markDirty: () => set({ dirty: true, hasDraft: true }),

  replaceDraft: ({ nodes, edges, floorCount, activeFloor, dirty, lastSig }) =>
    set({
      nodes,
      edges,
      floorCount,
      activeFloor: activeFloor ?? get().activeFloor,
      dirty: dirty ?? get().dirty,
      lastSig: lastSig ?? get().lastSig,
      hasDraft: true,
    }),

  clearDirty: (lastSig) => set({ dirty: false, lastSig, hasDraft: true }),

  discardDraft: () =>
    set({
      nodes: [],
      edges: [],
      floorCount: 2,
      activeFloor: 0,
      dirty: false,
      lastSig: '',
      hasDraft: false,
    }),
}));
