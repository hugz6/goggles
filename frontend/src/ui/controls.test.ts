import { describe, it, expect } from "vitest";
import { compileQuery, matchesQuery, makeHidden, emptyFilter } from "./controls";
import type { Filterable } from "./controls";

const pod: Filterable = {
  name: "web-frontend",
  kind: "Pod",
  namespace: "shop",
  health: "ok",
  nodeName: "worker-1",
  labels: { app: "web", tier: "frontend" },
  cpuMillis: 500,
  memBytes: 256 * 1024 * 1024,
  cpuLimitMillis: 1000, // 50% used
  memLimitBytes: 512 * 1024 * 1024, // 50% used
};
const badPod: Filterable = { name: "api", kind: "Pod", namespace: "shop", health: "error" };
const svc: Filterable = { name: "web-svc", kind: "Service", namespace: "shop" };

function m(node: Filterable, q: string): boolean {
  return matchesQuery(node, compileQuery(q));
}

describe("compileQuery", () => {
  it("splits typed tokens and negation", () => {
    const t = compileQuery("web ns:shop k:pod !h:error");
    expect(t).toEqual([
      { field: "name", value: "web", negate: false },
      { field: "namespace", value: "shop", negate: false },
      { field: "kind", value: "pod", negate: false },
      { field: "health", value: "error", negate: true },
    ]);
  });
});

describe("matchesQuery", () => {
  it("fuzzy name (subsequence)", () => {
    expect(m(pod, "wfr")).toBe(true); // w-e-b-f-r-ontend
    expect(m(pod, "xyz")).toBe(false);
  });

  it("filters by kind (name or acronym)", () => {
    expect(m(pod, "k:pod")).toBe(true);
    expect(m(svc, "k:svc")).toBe(true); // acronym
    expect(m(svc, "k:pod")).toBe(false);
  });

  it("filters by namespace, health, node", () => {
    expect(m(pod, "ns:shop")).toBe(true);
    expect(m(badPod, "h:error")).toBe(true);
    expect(m(pod, "h:error")).toBe(false);
    expect(m(pod, "node:worker")).toBe(true);
  });

  it("filters by label key=value and key alone", () => {
    expect(m(pod, "l:app=web")).toBe(true);
    expect(m(pod, "l:app=api")).toBe(false);
    expect(m(pod, "l:tier")).toBe(true);
    expect(m(pod, "l:absent")).toBe(false);
  });

  it("negation and AND combination", () => {
    expect(m(pod, "!h:error")).toBe(true);
    expect(m(badPod, "!h:error")).toBe(false);
    expect(m(pod, "k:pod ns:shop web")).toBe(true);
    expect(m(pod, "k:pod ns:other")).toBe(false);
  });

  it("empty query accepts everything", () => {
    expect(m(pod, "")).toBe(true);
  });

  it("filters by cpu/mem thresholds (bare number means >=)", () => {
    expect(m(pod, "cpu:500")).toBe(true);
    expect(m(pod, "cpu:501")).toBe(false);
    expect(m(pod, "cpu:>400")).toBe(true);
    expect(m(pod, "cpu:>500")).toBe(false);
    expect(m(pod, "cpu:<=500")).toBe(true);
    expect(m(pod, "mem:>=256")).toBe(true);
    expect(m(pod, "mem:<100")).toBe(false);
    expect(m(pod, "cpu:notanumber")).toBe(false); // unparseable threshold never matches
    expect(m(badPod, "cpu:>0")).toBe(false); // no cpuMillis: treated as 0
  });

  it("filters by cpu/mem percent of limit", () => {
    expect(m(pod, "cpu:>=50%")).toBe(true);
    expect(m(pod, "cpu:>50%")).toBe(false);
    expect(m(pod, "mem:50%")).toBe(true); // bare number means >=
    expect(m(pod, "mem:>60%")).toBe(false);
    expect(m(badPod, "cpu:>0%")).toBe(false); // no limit set: percent is undefined
  });
});

describe("makeHidden", () => {
  it("hides out-of-query and collapsed-group nodes", () => {
    const f = emptyFilter();
    f.query = "k:service";
    expect(makeHidden(f)(pod)).toBe(true); // pod excluded by the query
    expect(makeHidden(f)(svc)).toBe(false); // service visible

    const collapsed = emptyFilter();
    collapsed.collapsed.add("shop");
    expect(makeHidden(collapsed)(pod)).toBe(true); // namespace group collapsed

    // With a groupOf by kind: collapsing "Pod" hides the pod, not the service.
    const byKind = emptyFilter();
    byKind.collapsed.add("Pod");
    const groupByKind = (n: { kind: string }) => n.kind;
    expect(makeHidden(byKind, groupByKind)(pod)).toBe(true);
    expect(makeHidden(byKind, groupByKind)(svc)).toBe(false);
  });
});
