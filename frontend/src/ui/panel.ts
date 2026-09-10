// Details panel (DOM) for the entity selected in keyboard navigation.

import type { NavModel } from "../nav/model";
import type { Selection } from "../nav/navigation";
import { kindAcronym } from "../nav/kind";
import { THEME, panelStyle, legendTitle, statusColor } from "./theme";

export class Panel {
  private readonly el: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(onDetail?: () => void) {
    this.el = document.createElement("div");
    this.el.className = "g5s-panel g5s-select";
    Object.assign(this.el.style, {
      position: "fixed",
      top: "18px",
      left: "18px",
      minWidth: "290px",
      maxWidth: "calc(100vw - 36px)",
      boxSizing: "border-box",
      pointerEvents: "none",
      ...panelStyle(),
    });
    this.el.appendChild(legendTitle("select"));

    if (onDetail) {
      // re-enable pointer events just for this button (panel itself has none)
      const btn = document.createElement("button");
      btn.innerHTML = "◇ describe";
      Object.assign(btn.style, {
        position: "absolute",
        top: "-11px",
        right: "14px",
        pointerEvents: "auto",
        background: THEME.bgSolid,
        color: THEME.accent,
        border: `1px solid ${THEME.borderBright}`,
        borderRadius: "999px",
        cursor: "pointer",
        font: THEME.font,
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.06em",
        padding: "3px 11px",
        textTransform: "uppercase",
        transition: "background 0.15s, color 0.15s",
      });
      btn.addEventListener("mouseenter", () => {
        btn.style.color = "#ffffff";
        btn.style.background = THEME.brand;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.color = THEME.accent;
        btn.style.background = THEME.bgSolid;
      });
      btn.addEventListener("click", onDetail);
      this.el.appendChild(btn);
    }

    this.body = document.createElement("div");
    Object.assign(this.body.style, { padding: "15px 15px 13px", whiteSpace: "pre-wrap" });
    this.el.appendChild(this.body);

    document.body.appendChild(this.el);
  }

  update(model: NavModel, sel: Selection): void {
    this.body.innerHTML = describe(model, sel);
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

// Names come from the cluster and land in innerHTML: keep them inert.
function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

// A "key  value" pair line.
function line(label: string, value: string): string {
  return `<div style="padding:1px 0"><span style="color:${THEME.dim};display:inline-block;min-width:96px">${label}</span>${value}</div>`;
}

function strong(v: string): string {
  return `<span style="color:${THEME.accent}">${v}</span>`;
}

// Colored status dot + label (pod health).
function dot(health: string): string {
  const c = statusColor(health);
  return `<span style="color:${c};text-shadow:0 0 6px ${c}">●</span> <span style="color:${c}">${esc(health)}</span>`;
}

// "" or " (N% of limit)"; empty when the limit is undefined.
function ofLimit(usage: number, limit: number | undefined): string {
  if (!limit) {
    return "";
  }
  return ` (${Math.round((usage / limit) * 100)}% of limit)`;
}

function describe(model: NavModel, sel: Selection): string {
  if (sel.level === "namespace") {
    const count = model.entitiesByGroup.get(sel.namespace)?.length ?? 0;
    return line("group", strong(esc(sel.namespace) || "-")) + line("entities", String(count));
  }
  if (sel.level === "entity") {
    const node = model.nodeById.get(sel.entityId ?? "");
    if (!node) {
      return line("entity", "-");
    }
    let out =
      line("type", `${strong(kindAcronym(node.kind))} <span style="color:${THEME.dim}">${esc(node.kind)}</span>`) +
      line("name", esc(node.name)) +
      line("namespace", esc(node.namespace ?? "-"));
    if (node.kind === "Pod") {
      out +=
        line("health", dot(node.health ?? "ok")) +
        line("node", esc(node.nodeName ?? "-")) +
        line("containers", String(node.containers?.length ?? 0));
      if (node.cpuMillis) {
        out += line("cpu", `${node.cpuMillis} m${ofLimit(node.cpuMillis, node.cpuLimitMillis)}`);
      }
      if (node.memBytes) {
        out += line("memory", `${Math.round(node.memBytes / (1024 * 1024))} Mi${ofLimit(node.memBytes, node.memLimitBytes)}`);
      }
    }
    return out;
  }
  // container
  const node = model.nodeById.get(sel.entityId ?? "");
  const c = node?.containers?.find((x) => x.name === sel.containerName);
  return (
    line("container", strong(esc(c?.name ?? "-"))) +
    line("image", esc(c?.image ?? "-")) +
    line("pod", esc(node?.name ?? "-"))
  );
}
