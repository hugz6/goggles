import { describe, it, expect } from "vitest";
import { computeLayout } from "./containment";
import { namespaceClusters } from "./clusters";
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
    { id: "x", kind: "Pod", name: "x", namespace: "infra" },
  ],
  edges: [
    { from: "d", to: "r", kind: "owns" },
    { from: "r", to: "p1", kind: "owns" },
    { from: "r", to: "p2", kind: "owns" },
  ],
};

describe("namespaceClusters", () => {
  it("produces one nebula per namespace, deterministic order", () => {
    const clusters = namespaceClusters(graph, computeLayout(graph));
    expect(clusters.map((c) => c.namespace)).toEqual(["infra", "shop"]);
  });

  it("encloses all members of the namespace", () => {
    const layout = computeLayout(graph);
    const shop = namespaceClusters(graph, layout).find(
      (c) => c.namespace === "shop",
    )!;
    for (const id of ["d", "r", "p1", "p2"]) {
      expect(dist(layout.get(id)!, shop.center)).toBeLessThanOrEqual(shop.radius);
    }
  });
});
