// Query mini-language (space-separated tokens, combined with AND):
//   nginx            name (fuzzy, subsequence)
//   ns:default       namespace contains
//   k:pod / type:svc kind (full name or acronym)
//   l:app=web        label key=value; l:app -> key present
//   h:error          health (ok/warning/error)
//   node:worker-1    scheduling node
//   cpu:>500         CPU usage in millicores (>, >=, <, <=; bare number means >=)
//   mem:>256         memory usage in Mi (same operators)
//   cpu:>50%         CPU usage as % of its limit (no match if no limit is set)
//   mem:>80%         memory usage as % of its limit (same)
//   !term            negate a token (any field)

import { THEME, panelStyle, legendTitle } from "./theme";
import { kindAcronym } from "../nav/kind";
import { GROUP_MODES } from "../layout/grouping";
import type { GroupMode } from "../layout/grouping";

export interface Filterable {
  name: string;
  kind: string;
  namespace?: string;
  health?: string;
  nodeName?: string;
  labels?: Record<string, string>;
  cpuMillis?: number;
  memBytes?: number;
  cpuLimitMillis?: number;
  memLimitBytes?: number;
}

export interface FilterState {
  query: string;
  collapsed: Set<string>; // collapsed groups (shown as amas, contents hidden)
}

export function emptyFilter(): FilterState {
  return { query: "", collapsed: new Set() };
}

// --- Query language (pure, testable) ---

type Field = "name" | "namespace" | "kind" | "label" | "health" | "node" | "cpu" | "mem";

export interface QueryTerm {
  field: Field;
  value: string;
  negate: boolean;
}

const PREFIX: Record<string, Field> = {
  ns: "namespace",
  namespace: "namespace",
  k: "kind",
  kind: "kind",
  type: "kind",
  t: "kind",
  l: "label",
  label: "label",
  h: "health",
  health: "health",
  node: "node",
  cpu: "cpu",
  mem: "mem",
  memory: "mem",
};

export function compileQuery(q: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (let tok of q.trim().split(/\s+/)) {
    if (!tok) {
      continue;
    }
    let negate = false;
    if (tok.startsWith("!")) {
      negate = true;
      tok = tok.slice(1);
    }
    if (!tok) {
      continue;
    }
    const colon = tok.indexOf(":");
    if (colon > 0) {
      const field = PREFIX[tok.slice(0, colon).toLowerCase()];
      if (field) {
        terms.push({ field, value: tok.slice(colon + 1).toLowerCase(), negate });
        continue;
      }
    }
    terms.push({ field: "name", value: tok.toLowerCase(), negate });
  }
  return terms;
}

// ">100", ">=100", "<50", "<=50", "100" (bare number means ">="); trailing "%"
// marks it a percentage-of-limit threshold instead of an absolute one.
function parseThreshold(
  v: string,
): { op: ">" | ">=" | "<" | "<="; num: number; percent: boolean } | null {
  const m = v.match(/^(>=|<=|>|<)?(\d+(?:\.\d+)?)(%)?$/);
  if (!m) {
    return null;
  }
  return {
    op: (m[1] as ">" | ">=" | "<" | "<=" | undefined) ?? ">=",
    num: parseFloat(m[2]),
    percent: m[3] === "%",
  };
}

function compareThreshold(actual: number, t: { op: ">" | ">=" | "<" | "<="; num: number }): boolean {
  switch (t.op) {
    case ">":
      return actual > t.num;
    case ">=":
      return actual >= t.num;
    case "<":
      return actual < t.num;
    case "<=":
      return actual <= t.num;
  }
}

function fuzzy(hay: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const h = hay.toLowerCase();
  let i = 0;
  for (const ch of needle) {
    i = h.indexOf(ch, i);
    if (i < 0) {
      return false;
    }
    i++;
  }
  return true;
}

function termMatches(node: Filterable, t: QueryTerm): boolean {
  const v = t.value;
  switch (t.field) {
    case "name":
      return fuzzy(node.name, v);
    case "namespace":
      return (node.namespace ?? "").toLowerCase().includes(v);
    case "kind": {
      const k = node.kind.toLowerCase();
      const a = kindAcronym(node.kind).toLowerCase();
      return k.includes(v) || a.includes(v);
    }
    case "health":
      return (node.health ?? "ok").toLowerCase().includes(v);
    case "node":
      return (node.nodeName ?? "").toLowerCase().includes(v);
    case "cpu": {
      const t = parseThreshold(v);
      if (!t) {
        return false;
      }
      if (t.percent) {
        return !!node.cpuLimitMillis && compareThreshold(((node.cpuMillis ?? 0) / node.cpuLimitMillis) * 100, t);
      }
      return compareThreshold(node.cpuMillis ?? 0, t);
    }
    case "mem": {
      const t = parseThreshold(v);
      if (!t) {
        return false;
      }
      if (t.percent) {
        return !!node.memLimitBytes && compareThreshold(((node.memBytes ?? 0) / node.memLimitBytes) * 100, t);
      }
      return compareThreshold((node.memBytes ?? 0) / (1024 * 1024), t);
    }
    case "label": {
      const labels = node.labels ?? {};
      const eq = v.indexOf("=");
      if (eq >= 0) {
        const key = v.slice(0, eq);
        const val = v.slice(eq + 1);
        const actual = labels[key];
        return actual !== undefined && actual.toLowerCase().includes(val);
      }
      return Object.keys(labels).some((k) => k.toLowerCase().includes(v));
    }
  }
}

export function matchesQuery(node: Filterable, terms: QueryTerm[]): boolean {
  for (const t of terms) {
    const m = termMatches(node, t);
    if (t.negate ? m : !m) {
      return false;
    }
  }
  return true;
}

// Hidden if in a collapsed group or out of the query.
export function makeHidden(
  filter: FilterState,
  groupOf: (node: Filterable) => string = (n) => n.namespace ?? "",
): (node: Filterable) => boolean {
  const terms = compileQuery(filter.query);
  return (node) => {
    const g = groupOf(node);
    if (g && filter.collapsed.has(g)) {
      return true;
    }
    return !matchesQuery(node, terms);
  };
}

// --- UI ---

export interface SearchItem extends Filterable {
  id: string;
}

export interface ControlsDeps {
  groups: string[]; // current group keys (for collapse)
  groupMode: GroupMode;
  search: SearchItem[];
  filter: FilterState;
  onChange(): void; // the filter changed -> recompute visibility
  onPick(id: string): void; // a result was chosen (click or Enter)
  onGroupMode(mode: GroupMode): void;
}

const HELP =
  "name · ns:foo · k:pod · l:app=web · h:error · node:w1 · cpu:>500 · mem:>256 · !term";

export class Controls {
  private readonly el: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly counter: HTMLDivElement;
  private input!: HTMLInputElement;

  constructor(private readonly deps: ControlsDeps) {
    this.el = document.createElement("div");
    this.el.className = "g5s-panel g5s-filter";
    Object.assign(this.el.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      width: "min(320px, calc(100vw - 36px))",
      maxHeight: "90vh",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      ...panelStyle(),
    });
    this.el.appendChild(legendTitle("filter"));

    this.body = document.createElement("div");
    this.body.className = "g5s-filter-body";
    Object.assign(this.body.style, {
      padding: "15px 15px 13px",
      overflowY: "auto",
      maxHeight: "min(78vh, 720px)",
    });
    this.el.appendChild(this.body);

    this.results = document.createElement("div");
    this.counter = document.createElement("div");
    document.body.appendChild(this.el);
    this.render();
  }

  dispose(): void {
    this.el.remove();
  }

  private groupSelector(): HTMLDivElement {
    const { deps } = this;
    const wrap = document.createElement("div");
    Object.assign(wrap.style, { display: "flex", gap: "4px", marginBottom: "9px", flexWrap: "wrap" });
    const tag = document.createElement("span");
    tag.textContent = "group";
    Object.assign(tag.style, { color: THEME.dim, alignSelf: "center", marginRight: "2px", fontSize: "11px" });
    wrap.appendChild(tag);
    for (const mode of GROUP_MODES) {
      const active = mode === deps.groupMode;
      const b = document.createElement("button");
      b.textContent = mode;
      Object.assign(b.style, {
        cursor: "pointer",
        font: "inherit",
        fontSize: "11px",
        fontWeight: active ? "600" : "500",
        padding: "3px 10px",
        borderRadius: "999px",
        border: `1px solid ${active ? "transparent" : THEME.borderInput}`,
        background: active ? THEME.brand : "transparent",
        color: active ? "#ffffff" : THEME.dim,
        transition: "background 0.15s, color 0.15s",
      });
      b.addEventListener("click", () => {
        if (mode !== deps.groupMode) {
          deps.onGroupMode(mode);
        }
      });
      wrap.appendChild(b);
    }
    return wrap;
  }

  private render(): void {
    const { deps } = this;
    this.body.replaceChildren();

    this.body.appendChild(this.groupSelector());

    // --- Query bar ---
    const prompt = document.createElement("div");
    Object.assign(prompt.style, { display: "flex", alignItems: "center", gap: "7px" });
    const caret = document.createElement("span");
    caret.textContent = "⌕";
    Object.assign(caret.style, {
      color: THEME.dim,
      fontSize: "16px",
      lineHeight: "1",
    });

    const input = document.createElement("input");
    input.type = "text";
    input.id = "g5s-filter"; // targeted by the "/" shortcut (focus)
    input.value = deps.filter.query;
    input.placeholder = "filter…";
    input.spellcheck = false;
    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      background: THEME.bgInput,
      color: THEME.fg,
      border: `1px solid ${THEME.borderInput}`,
      borderRadius: "9px",
      padding: "6px 10px",
      font: "inherit",
      outline: "none",
    });
    this.input = input;
    input.addEventListener("focus", () => this.paintInput());
    input.addEventListener("blur", () => this.paintInput());
    input.addEventListener("input", () => {
      deps.filter.query = input.value;
      deps.onChange(); // re-apply the filter to the scene
      this.refreshResults();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = this.matches()[0];
        if (first) {
          deps.onPick(first.id); // Enter = jump to the first result
        }
        e.preventDefault();
      } else if (e.key === "Escape") {
        input.blur(); // Escape returns focus to the scene
      }
      e.stopPropagation(); // don't let keyboard nav see the keystroke
    });
    prompt.append(caret, input);

    const help = document.createElement("div");
    help.textContent = HELP;
    Object.assign(help.style, {
      color: THEME.dim,
      fontSize: "9.5px",
      margin: "4px 0 6px",
      lineHeight: "1.5",
    });

    Object.assign(this.counter.style, {
      color: THEME.dim,
      fontSize: "10px",
      margin: "2px 0 4px",
    });

    this.results.replaceChildren();
    this.results.style.marginBottom = "6px";

    this.body.append(prompt, help, this.counter, this.results);

    // --- Group collapse ---
    const nsSec = document.createElement("div");
    const h = document.createElement("div");
    h.textContent = "collapse";
    Object.assign(h.style, {
      color: THEME.dim,
      margin: "14px 0 6px",
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    });
    nsSec.appendChild(h);

    for (const ns of deps.groups) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "7px",
        cursor: "pointer",
        padding: "1px 0",
      });
      const glyph = document.createElement("span");
      const draw = () => (glyph.textContent = deps.filter.collapsed.has(ns) ? "▸" : "▾");
      draw();
      glyph.style.color = THEME.accent;
      glyph.style.width = "10px";
      const name = document.createElement("span");
      name.textContent = ns;
      Object.assign(name.style, {
        color: THEME.fg,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      row.addEventListener("click", () => {
        if (deps.filter.collapsed.has(ns)) {
          deps.filter.collapsed.delete(ns);
        } else {
          deps.filter.collapsed.add(ns);
        }
        draw();
        deps.onChange();
      });
      row.append(glyph, name);
      nsSec.appendChild(row);
    }
    this.body.appendChild(nsSec);

    this.refreshResults();
  }

  private matches(): SearchItem[] {
    const q = this.deps.filter.query.trim();
    if (!q) {
      return [];
    }
    const terms = compileQuery(q);
    return this.deps.search.filter((s) => matchesQuery(s, terms));
  }

  private paintInput(): void {
    const q = this.deps.filter.query.trim();
    const none = q.length > 0 && this.matches().length === 0;
    this.input.style.color = none ? THEME.error : THEME.fg;
    this.input.style.borderColor = none
      ? THEME.error
      : document.activeElement === this.input
        ? THEME.accent
        : THEME.borderInput;
  }

  private refreshResults(): void {
    const q = this.deps.filter.query.trim();
    const all = this.matches();
    const none = q.length > 0 && all.length === 0;
    this.paintInput();
    this.counter.style.color = none ? THEME.error : THEME.dim;
    this.counter.textContent = none ? "no match" : q ? `${all.length} match${all.length === 1 ? "" : "es"}` : "";

    this.results.replaceChildren();
    for (const m of all.slice(0, 8)) {
      const item = document.createElement("div");
      const acr = document.createElement("span");
      acr.style.color = THEME.dim;
      acr.textContent = kindAcronym(m.kind);
      item.append(acr, ` ${m.name}`); // cluster-supplied name: never innerHTML
      item.title = `${m.namespace ?? ""}/${m.name}`;
      Object.assign(item.style, {
        padding: "5px 9px",
        cursor: "pointer",
        borderRadius: "8px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        transition: "background 0.12s",
      });
      item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(138,110,255,0.14)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", () => this.deps.onPick(m.id));
      this.results.appendChild(item);
    }
  }
}
