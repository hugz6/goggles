import { describe, it, expect } from "vitest";
import { buildNavModel } from "./model";
import type { Graph } from "../api/client";

// Namespace "a": Deployment d1 -> RS r1 -> pods p1,p2; Service s1.
// Namespace "b": Deployment d2 -> RS r2 -> pod p3.
const graph: Graph = {
  nodes: [
    { id: "d1", kind: "Deployment", name: "web", namespace: "a" },
    { id: "r1", kind: "ReplicaSet", name: "web-rs", namespace: "a" },
    { id: "p1", kind: "Pod", name: "web-1", namespace: "a", containers: [{ name: "c", image: "i" }] },
    { id: "p2", kind: "Pod", name: "web-2", namespace: "a" },
    { id: "s1", kind: "Service", name: "web-svc", namespace: "a" },
    { id: "d2", kind: "Deployment", name: "api", namespace: "b" },
    { id: "r2", kind: "ReplicaSet", name: "api-rs", namespace: "b" },
    { id: "p3", kind: "Pod", name: "api-1", namespace: "b" },
  ],
  edges: [
    { from: "d1", to: "r1", kind: "owns" },
    { from: "r1", to: "p1", kind: "owns" },
    { from: "r1", to: "p2", kind: "owns" },
    { from: "d2", to: "r2", kind: "owns" },
    { from: "r2", to: "p3", kind: "owns" },
  ],
};

describe("buildNavModel", () => {
  it("lists groups sorted", () => {
    expect(buildNavModel(graph).groups).toEqual(["a", "b"]);
  });

  it("lists ALL entities of a namespace (not only pods)", () => {
    const m = buildNavModel(graph);
    expect(m.entitiesByGroup.get("a")).toEqual(["d1", "p1", "p2", "r1", "s1"]);
    expect(m.entitiesByGroup.get("b")).toEqual(["d2", "p3", "r2"]);
  });

  it("excludes unpositioned nodes (degraded mode)", () => {
    const m = buildNavModel(graph, (id) => id !== "s1"); // s1 unpositioned
    expect(m.entitiesByGroup.get("a")).toEqual(["d1", "p1", "p2", "r1"]);
  });
});
