import type { Graph, GraphNode } from "../api/client";
import { mapPush } from "../layout/types";

export interface NavModel {
  groups: string[]; // sorted group keys (namespace/kind/node/health per the mode)
  entitiesByGroup: Map<string, string[]>; // group -> its entity ids (sorted)
  nodeById: Map<string, GraphNode>;
}

export function buildNavModel(
  graph: Graph,
  hasPosition: (id: string) => boolean = () => true,
  groupOf: (n: GraphNode) => string = (n) => n.namespace ?? "",
): NavModel {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const entitiesByGroup = new Map<string, string[]>();
  const keys = new Set<string>();

  for (const n of graph.nodes) {
    const key = groupOf(n);
    if (!key || !hasPosition(n.id)) {
      continue; // not navigable (empty group or unpositioned)
    }
    mapPush(entitiesByGroup, key, n.id);
    keys.add(key);
  }

  const groups = [...keys].sort();
  for (const arr of entitiesByGroup.values()) {
    arr.sort();
  }

  return { groups, entitiesByGroup, nodeById };
}
