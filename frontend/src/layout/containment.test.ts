import { describe, it, expect } from "vitest";
import { computeLayout } from "./containment";
import type { Vec3 } from "./types";
import type { Graph } from "../api/client";

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const graph: Graph = {
  nodes: [
    { id: "d", kind: "Deployment", name: "web", namespace: "shop" },
    { id: "r", kind: "ReplicaSet", name: "web-rs", namespace: "shop" },
    { id: "p1", kind: "Pod", name: "p1", namespace: "shop" },
    { id: "p2", kind: "Pod", name: "p2", namespace: "shop" },
    { id: "p3", kind: "Pod", name: "p3", namespace: "shop" },
    { id: "svc", kind: "Service", name: "svc", namespace: "shop" },
    { id: "x", kind: "Pod", name: "x", namespace: "infra" },
  ],
  edges: [
    { from: "d", to: "r", kind: "owns" },
    { from: "r", to: "p1", kind: "owns" },
    { from: "r", to: "p2", kind: "owns" },
    { from: "r", to: "p3", kind: "owns" },
  ],
};

describe("computeLayout", () => {
  it("is deterministic: same input -> same positions", () => {
    const a = computeLayout(graph);
    const b = computeLayout(graph);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("places every node", () => {
    const layout = computeLayout(graph);
    for (const n of graph.nodes) {
      expect(layout.has(n.id)).toBe(true);
    }
  });

  it("does not overlap siblings of the same parent", () => {
    const layout = computeLayout(graph);
    const pods = ["p1", "p2", "p3"].map((id) => layout.get(id)!);
    for (let i = 0; i < pods.length; i++) {
      for (let j = i + 1; j < pods.length; j++) {
        // Well beyond a node's diameter (radius 1.2).
        expect(dist(pods[i], pods[j])).toBeGreaterThan(2.4);
      }
    }
  });

  it("respects containment: pods orbit their ReplicaSet", () => {
    const layout = computeLayout(graph);
    const r = layout.get("r")!;
    const radii = ["p1", "p2", "p3"].map((id) => dist(layout.get(id)!, r));
    // Same orbit (equal radii) and close to their parent.
    for (const radius of radii) {
      expect(Math.abs(radius - radii[0])).toBeLessThan(1e-6);
      expect(radius).toBeLessThan(20);
    }
  });

  it("separates namespaces in space", () => {
    const layout = computeLayout(graph);
    // An infra node is far from the shop nodes.
    expect(dist(layout.get("x")!, layout.get("p1")!)).toBeGreaterThan(50);
  });

  it("places a Service near the pods it serves (serves edges)", () => {
    const g: Graph = {
      nodes: [
        { id: "d", kind: "Deployment", name: "web", namespace: "shop" },
        { id: "r", kind: "ReplicaSet", name: "web-rs", namespace: "shop" },
        { id: "p1", kind: "Pod", name: "p1", namespace: "shop" },
        { id: "p2", kind: "Pod", name: "p2", namespace: "shop" },
        { id: "svc", kind: "Service", name: "svc", namespace: "shop" },
      ],
      edges: [
        { from: "d", to: "r", kind: "owns" },
        { from: "r", to: "p1", kind: "owns" },
        { from: "r", to: "p2", kind: "owns" },
        { from: "svc", to: "p1", kind: "serves" },
        { from: "svc", to: "p2", kind: "serves" },
      ],
    };
    const layout = computeLayout(g);
    const svc = layout.get("svc")!;
    // The Service is close to its pods (much closer than an island radius).
    expect(dist(svc, layout.get("p1")!)).toBeLessThan(20);
    expect(dist(svc, layout.get("p2")!)).toBeLessThan(20);
  });

  it("places a PVC right beside the pod that mounts it (mounts edges)", () => {
    const g: Graph = {
      nodes: [
        { id: "d", kind: "Deployment", name: "db", namespace: "shop" },
        { id: "r", kind: "ReplicaSet", name: "db-rs", namespace: "shop" },
        { id: "p", kind: "Pod", name: "db-0", namespace: "shop" },
        { id: "pvc", kind: "PersistentVolumeClaim", name: "data", namespace: "shop" },
      ],
      edges: [
        { from: "d", to: "r", kind: "owns" },
        { from: "r", to: "p", kind: "owns" },
        { from: "p", to: "pvc", kind: "mounts" },
      ],
    };
    const layout = computeLayout(g);
    expect(dist(layout.get("pvc")!, layout.get("p")!)).toBeLessThan(12);
  });
});
