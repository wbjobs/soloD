import type { Node, Edge } from 'reactflow';

export interface NodeData {
  label: string;
}

export interface EdgeData {
  label: string;
}

export type GraphNode = Node<NodeData>;
export type GraphEdge = Edge<EdgeData>;

export interface ContextMenuState {
  x: number;
  y: number;
  type: 'canvas' | 'node' | 'edge';
  nodeId?: string;
  edgeId?: string;
}

export interface EditModalState {
  isOpen: boolean;
  type: 'node' | 'edge';
  id?: string;
  currentLabel: string;
}
