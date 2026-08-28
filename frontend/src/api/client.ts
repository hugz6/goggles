// Mirrors backend/internal/domain/model.go.

export interface Container {
  name: string;
  image: string;
}

export type Health = "ok" | "warning" | "error";

export interface DetailSection {
  title: string;
  rows: [string, string][];
  accentKey?: boolean;
}

export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  custom?: boolean;
  containers?: Container[];
  nodeName?: string;
  health?: Health;
  cpuMillis?: number;
  memBytes?: number;
  cpuLimitMillis?: number;
  memLimitBytes?: number;
  detail?: DetailSection[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Tolerates {} (no data source active yet).
export function normalizeGraph(data: unknown): Graph {
  const obj = (data ?? {}) as Partial<Graph>;
  return {
    nodes: Array.isArray(obj.nodes) ? obj.nodes : [],
    edges: Array.isArray(obj.edges) ? obj.edges : [],
  };
}

export async function fetchGraph(): Promise<Graph> {
  const res = await fetch("/api/graph");
  if (!res.ok) {
    throw new Error(`/api/graph responded ${res.status}`);
  }
  return normalizeGraph(await res.json());
}
