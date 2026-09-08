import { describe, it, expect } from "vitest";
import { buildNavModel } from "./model";
import { Navigation } from "./navigation";
import type { Graph } from "../api/client";

const graph: Graph = {
  nodes: [
    { id: "d1", kind: "Deployment", name: "web", namespace: "a" },
    { id: "r1", kind: "ReplicaSet", name: "web-rs", namespace: "a" },
    { id: "p1", kind: "Pod", name: "web-1", namespace: "a", containers: [{ name: "c1", image: "i" }, { name: "c2", image: "i" }] },
    { id: "s1", kind: "Service", name: "web-svc", namespace: "a" },
    { id: "d2", kind: "Deployment", name: "api", namespace: "b" },
    { id: "p2", kind: "Pod", name: "api-1", namespace: "b" },
  ],
  edges: [
    { from: "d1", to: "r1", kind: "owns" },
    { from: "r1", to: "p1", kind: "owns" },
  ],
};

function newNav(): Navigation {
  return new Navigation(buildNavModel(graph));
}

describe("Navigation", () => {
  it("starts at the namespace level on the first one", () => {
    expect(newNav().current()).toEqual({ level: "namespace", namespace: "a" });
  });

  it("enters the namespace: all entities are siblings", () => {
    const nav = newNav();
    nav.enter(); // -> entity, first entity of "a" (sorted order: d1)
    expect(nav.current()).toMatchObject({ level: "entity", entityId: "d1" });
    expect(nav.siblingIds()).toEqual(["d1", "p1", "r1", "s1"]);
  });

  it("navigates to a non-pod entity (Service) and a pod", () => {
    const nav = newNav();
    nav.enter();
    nav.setIndex(3); // s1 (Service)
    expect(nav.current().entityId).toBe("s1");
    nav.setIndex(1); // p1 (Pod)
    expect(nav.current().entityId).toBe("p1");
  });

  it("descends into a pod's containers, not another entity's", () => {
    const nav = newNav();
    nav.enter();
    nav.setIndex(3); // s1: no container
    nav.enter();
    expect(nav.current().level).toBe("entity"); // stays at entity level
    nav.setIndex(1); // p1
    nav.enter();
    expect(nav.current()).toMatchObject({ level: "container", containerName: "c1" });
    nav.setIndex(1);
    expect(nav.current().containerName).toBe("c2");
    nav.back();
    expect(nav.current()).toMatchObject({ level: "entity", entityId: "p1" });
  });
});
