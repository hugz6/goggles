// Group nebulae: centroid + enclosing radius per group.

import type { Graph, GraphNode } from "../api/client";
import type { Layout, Vec3 } from "./types";

export interface NamespaceCluster {
  namespace: string; // group key (namespace, kind, node or health per the mode)
  center: Vec3;
  radius: number;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function namespaceClusters(
  graph: Graph,
  layout: Layout,
  groupOf: (n: GraphNode) => string = (n) => n.namespace ?? "",
): NamespaceCluster[] {
  const members = new Map<string, Vec3[]>();
  for (const n of graph.nodes) {
    const p = layout.get(n.id);
    if (!p) {
      continue;
    }
    const ns = groupOf(n);
    const arr = members.get(ns);
    if (arr) {
      arr.push(p);
    } else {
      members.set(ns, [p]);
    }
  }

  const clusters: NamespaceCluster[] = [];
  for (const [namespace, points] of members) {
    const center: Vec3 = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };
    let enclosing = 0;
    for (const p of points) {
      enclosing = Math.max(enclosing, distance(p, center));
    }
    clusters.push({ namespace, center, radius: Math.max(enclosing * 1.25, 30) }); // margin + floor
  }

  clusters.sort((a, b) => (a.namespace < b.namespace ? -1 : 1)); // deterministic
  return clusters;
}
