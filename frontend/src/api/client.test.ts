import { describe, it, expect } from "vitest";
import { normalizeGraph } from "./client";

describe("normalizeGraph", () => {
  it("decodes a full graph", () => {
    const data = {
      nodes: [
        {
          id: "u1",
          kind: "Pod",
          name: "p",
          namespace: "ns",
          containers: [{ name: "c", image: "img:1" }],
          nodeName: "node-1",
        },
      ],
      edges: [{ from: "a", to: "b", kind: "owns" }],
    };
    const g = normalizeGraph(data);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].containers?.[0].image).toBe("img:1");
    expect(g.edges[0].kind).toBe("owns");
  });

  it("normalizes an empty response to an empty graph", () => {
    expect(normalizeGraph({})).toEqual({ nodes: [], edges: [] });
    expect(normalizeGraph(null)).toEqual({ nodes: [], edges: [] });
  });
});
