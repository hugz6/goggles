// Nested-containment layout: namespaces are regions, children orbit their parent.

import type { Graph } from "../api/client";
import { mapPush } from "./types";
import type { Vec3, Layout } from "./types";
import { orbit, sunflower, GOLDEN_ANGLE } from "./orbital";
import { sortedIds } from "./stable";
import { groupOfFactory } from "./grouping";
import type { GroupMode } from "./grouping";

const GALAXY_SPACING = 420; // radial gap between namespace islands
const GALAXY_THICKNESS = 28; // out-of-plane thickness, for 3D relief

const ROOT_SPACING = 30; // gap between workloads of a namespace

// floor radius / minimum gap per child depth (RS around workload, pods around RS)
const DEPTH_MIN_RADIUS = [8, 6];
const DEPTH_MIN_GAP = [6, 5];

const FLAT_SPACING = 7; // gap between members of a flat group (kind/node/health)

// "namespace" mode keeps the containment cascade; other modes lay each group flat.
export function computeLayout(graph: Graph, mode: GroupMode = "namespace"): Layout {
  if (mode !== "namespace") {
    return flatLayout(graph, mode);
  }
  const layout: Layout = new Map();
  const present = new Set(graph.nodes.map((n) => n.id));

  const children = new Map<string, string[]>();
  const owned = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== "owns" || !present.has(e.from) || !present.has(e.to)) {
      continue;
    }
    mapPush(children, e.from, e.to);
    owned.add(e.to);
  }

  const rootsByNs = new Map<string, string[]>(); // cluster-scoped nodes under ""
  for (const n of graph.nodes) {
    if (owned.has(n.id)) {
      continue;
    }
    mapPush(rootsByNs, n.namespace ?? "", n.id);
  }

  const namespaces = [...rootsByNs.keys()].sort();
  namespaces.forEach((ns, i) => {
    placeChildren(
      galaxyCenter(i, namespaces.length),
      sortedIds(rootsByNs.get(ns)!),
      0,
      layout,
      children,
    );
  });

  colocate(graph, layout, "Service", "serves", "from", SVC_OFFSET);
  colocate(graph, layout, "PersistentVolumeClaim", "mounts", "to", PVC_OFFSET);
  return layout;
}

function flatLayout(graph: Graph, mode: GroupMode): Layout {
  const layout: Layout = new Map();
  const groupOf = groupOfFactory(mode);
  const byGroup = new Map<string, string[]>();
  for (const n of graph.nodes) {
    mapPush(byGroup, groupOf(n), n.id);
  }
  const groups = [...byGroup.keys()].sort();
  groups.forEach((g, i) => {
    const center = galaxyCenter(i, groups.length);
    for (const [id, pos] of sunflower(center, sortedIds(byGroup.get(g)!), FLAT_SPACING)) {
      layout.set(id, pos);
    }
  });
  return layout;
}

const SVC_OFFSET: Vec3 = { x: 0, y: 5, z: 0 }; // service floats above its pods
const PVC_OFFSET: Vec3 = { x: 5, y: -3, z: 0 }; // beside the mounting pod

// Pins every node of `kind` onto the centroid of the pods it links to.
// anchorEnd says which end of the edge carries that node.
function colocate(
  graph: Graph,
  layout: Layout,
  kind: string,
  edgeKind: string,
  anchorEnd: "from" | "to",
  offset: Vec3,
): void {
  const pods = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === edgeKind) {
      const [anchor, pod] = anchorEnd === "from" ? [e.from, e.to] : [e.to, e.from];
      mapPush(pods, anchor, pod);
    }
  }
  for (const n of graph.nodes) {
    if (n.kind !== kind) {
      continue;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    let count = 0;
    for (const pid of pods.get(n.id) ?? []) {
      const p = layout.get(pid);
      if (p) {
        x += p.x;
        y += p.y;
        z += p.z;
        count++;
      }
    }
    if (count > 0) {
      layout.set(n.id, {
        x: x / count + offset.x,
        y: y / count + offset.y,
        z: z / count + offset.z,
      });
    }
  }
}

function galaxyCenter(i: number, count: number): Vec3 {
  if (count === 1) {
    return { x: 0, y: 0, z: 0 };
  }
  const radius = GALAXY_SPACING * Math.sqrt(i);
  const angle = i * GOLDEN_ANGLE;
  return {
    x: radius * Math.cos(angle),
    y: (i % 2 === 0 ? 1 : -1) * GALAXY_THICKNESS,
    z: radius * Math.sin(angle),
  };
}

const LEVEL_DROP = 10; // Y drop per ownership level: vertical cascade

function placeChildren(
  center: Vec3,
  ids: string[],
  depth: number,
  layout: Layout,
  children: Map<string, string[]>,
): void {
  let positions: Map<string, Vec3>;
  if (depth === 0) {
    positions = sunflower(center, ids, ROOT_SPACING);
  } else {
    const below: Vec3 = { x: center.x, y: center.y - LEVEL_DROP, z: center.z };
    if (ids.length === 1) {
      positions = new Map([[ids[0], below]]);
    } else {
      const d = Math.min(depth - 1, DEPTH_MIN_RADIUS.length - 1);
      positions = orbit(below, ids, {
        minRadius: DEPTH_MIN_RADIUS[d],
        minGap: DEPTH_MIN_GAP[d],
        phase: depth * 0.5,
      });
    }
  }
  for (const [id, pos] of positions) {
    layout.set(id, pos);
    const kids = children.get(id);
    if (kids && kids.length > 0) {
      placeChildren(pos, sortedIds(kids), depth + 1, layout, children);
    }
  }
}
