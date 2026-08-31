// Each mode partitions objects differently (one nebula per group).

export interface Groupable {
  namespace?: string;
  kind: string;
  nodeName?: string;
  health?: string;
}

export type GroupMode = "namespace" | "kind" | "node" | "health";

export const GROUP_MODES: GroupMode[] = ["namespace", "kind", "node", "health"];

// Objects lacking the relevant attribute fall into "other".
export function groupKeyOf(node: Groupable, mode: GroupMode): string {
  switch (mode) {
    case "namespace":
      return node.namespace ?? "";
    case "kind":
      return node.kind;
    case "node":
      return node.kind === "Pod" ? node.nodeName || "unscheduled" : "other";
    case "health":
      return node.kind === "Pod" ? node.health ?? "ok" : "other";
  }
}

export function groupOfFactory(mode: GroupMode): (node: Groupable) => string {
  return (node) => groupKeyOf(node, mode);
}
