// Help overlay ("?" key). Static content; only visibility is toggled.

import { THEME, ensureStyles, legendTitle, statusColor } from "./theme";

// mirrors render/shapes.geometryForKind
type ShapeKind =
  | "sphere"
  | "cube"
  | "octahedron"
  | "icosahedron"
  | "dodecahedron"
  | "tetrahedron"
  | "torus"
  | "cone"
  | "cylinder"
  | "knot";

const SHAPES: { kind: string; acr: string; shape: ShapeKind }[] = [
  { kind: "Pod", acr: "POD", shape: "sphere" },
  { kind: "Deployment", acr: "DEP", shape: "cube" },
  { kind: "ReplicaSet", acr: "RS", shape: "octahedron" },
  { kind: "StatefulSet", acr: "STS", shape: "icosahedron" },
  { kind: "DaemonSet", acr: "DS", shape: "dodecahedron" },
  { kind: "Job", acr: "JOB", shape: "tetrahedron" },
  { kind: "Service", acr: "SVC", shape: "torus" },
  { kind: "Ingress", acr: "ING", shape: "cone" },
  { kind: "PersistentVolumeClaim", acr: "PVC", shape: "cylinder" },
  { kind: "Custom resource (CRD)", acr: "CRD", shape: "knot" },
];

// "knot" is the only shape whose name does not read on its own.
function shapeName(shape: ShapeKind): string {
  return shape === "knot" ? "torus knot" : shape;
}

// mirrors main.onKey
const KEYS: [string, string][] = [
  ["Arrows", "move the selection between neighboring objects"],
  ["Q", "enter / dive in (semantic zoom)"],
  ["W", "exit / go up one level"],
  ["E", "show / hide network links"],
  ["O", "show / hide ownership links"],
  ["/", "jump to the filter bar"],
  ["?", "open / close this help"],
  ["Esc", "go up one level (closes overlays)"],
];

const MOUSE: [string, string][] = [
  ["drag", "rotate the camera"],
  ["wheel", "zoom in / out"],
];

// mirrors ui/controls.compileQuery
const FILTER: [string, string][] = [
  ["nginx", "name: fuzzy match (subsequence)"],
  ["ns:foo", "namespace contains \"foo\""],
  ["k:pod", "kind: full name or acronym (also type:, t:)"],
  ["l:app=web", "label key=value (l:app = key present)"],
  ["h:error", "health: ok / warning / error"],
  ["node:w1", "scheduling node"],
  ["cpu:>500", "CPU usage in millicores (>, >=, <, <=)"],
  ["mem:>256", "memory usage in Mi (same operators)"],
  ["cpu:>50%", "CPU usage as % of its limit (no limit = no match)"],
  ["mem:>80%", "memory usage as % of its limit (same)"],
  ["!term", "negation: prefix ! on any token"],
];

// mirrors layout/grouping
const GROUPS: [string, string][] = [
  ["namespace", "by project / team (ownership cascade)"],
  ["kind", "by object type"],
  ["node", "by host machine"],
  ["health", "by health state"],
];

// Every help line shares this shell: a flex row, left cell then description.
function rowShell(align: "center" | "baseline"): HTMLDivElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: align,
    gap: "10px",
    padding: "3px 0",
  });
  return row;
}

function descCell(text: string): HTMLSpanElement {
  const d = document.createElement("span");
  d.textContent = text;
  d.style.color = THEME.fg2;
  d.style.fontSize = "12.5px";
  return d;
}

export class HelpView {
  private readonly backdrop: HTMLDivElement;

  constructor() {
    ensureStyles();
    this.backdrop = document.createElement("div");
    Object.assign(this.backdrop.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(10,8,18,0.55)",
      backdropFilter: "blur(3px)",
      zIndex: "60",
    });
    this.backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === this.backdrop) {
        this.hide(); // click outside the panel = close
      }
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "relative",
      width: "min(680px, 94vw)",
      maxHeight: "88vh",
      display: "flex",
      flexDirection: "column",
      font: THEME.font,
      color: THEME.fg,
      background: THEME.bg,
      border: `1px solid ${THEME.border}`,
      borderRadius: "16px",
      boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
      backdropFilter: "blur(20px)",
      animation: "g5s-rise 0.24s cubic-bezier(0.2,0.8,0.2,1) both",
    });
    panel.appendChild(legendTitle("help", THEME.accent));
    panel.appendChild(this.header());
    panel.appendChild(this.body());
    this.backdrop.appendChild(panel);
    document.body.appendChild(this.backdrop);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!this.isOpen()) {
        return;
      }
      if (e.key === "Escape" || e.key === "?") {
        this.hide();
        e.preventDefault();
      }
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
  }

  isOpen(): boolean {
    return this.backdrop.style.display !== "none";
  }

  toggle(): void {
    this.isOpen() ? this.hide() : this.show();
  }

  show(): void {
    this.backdrop.style.display = "flex";
  }

  hide(): void {
    this.backdrop.style.display = "none";
  }

  private header(): HTMLDivElement {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex",
      alignItems: "baseline",
      gap: "10px",
      padding: "16px 18px 12px",
      borderBottom: `1px solid ${THEME.border}`,
    });

    const title = document.createElement("span");
    title.textContent = "g5s help";
    title.style.fontSize = "18px";
    title.style.fontWeight = "600";

    const sub = document.createElement("span");
    sub.textContent = "shortcuts · filter · legend";
    Object.assign(sub.style, {
      color: THEME.dim,
      fontSize: "11px",
      letterSpacing: "0.06em",
    });

    const close = document.createElement("button");
    close.textContent = "✕";
    Object.assign(close.style, {
      marginLeft: "auto",
      background: "transparent",
      color: THEME.dim,
      border: "none",
      cursor: "pointer",
      font: "inherit",
      fontSize: "14px",
    });
    close.addEventListener("mouseenter", () => (close.style.color = THEME.error));
    close.addEventListener("mouseleave", () => (close.style.color = THEME.dim));
    close.addEventListener("click", () => this.hide());

    bar.append(title, sub, close);
    return bar;
  }

  private body(): HTMLDivElement {
    const scroll = document.createElement("div");
    Object.assign(scroll.style, {
      padding: "6px 18px 18px",
      overflowY: "auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: "6px 28px",
    });

    scroll.append(
      this.section("Keyboard", this.kbdRows(KEYS)),
      this.section("Mouse", this.kbdRows(MOUSE)),
      this.section("Filter  /", this.tokenRows(FILTER)),
      this.section("Grouping  (group by)", this.tokenRows(GROUPS)),
      this.section("Shapes  (K8s kind)", this.shapeRows()),
      this.section("Colors & markers", this.legendRows()),
    );
    return scroll;
  }

  private section(title: string, content: HTMLElement): HTMLDivElement {
    const sec = document.createElement("div");
    sec.style.margin = "12px 0 2px";
    const h = document.createElement("div");
    h.textContent = title;
    Object.assign(h.style, {
      color: THEME.accent,
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      marginBottom: "8px",
    });
    sec.append(h, content);
    return sec;
  }

  private kbdRows(rows: [string, string][]): HTMLDivElement {
    const wrap = document.createElement("div");
    for (const [key, desc] of rows) {
      const row = rowShell("center");
      const cap = document.createElement("b");
      cap.textContent = key;
      Object.assign(cap.style, {
        flex: "0 0 auto",
        minWidth: "58px",
        textAlign: "center",
        color: THEME.fg,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "6px",
        padding: "2px 8px",
        fontWeight: "600",
        fontSize: "12px",
        boxShadow: "0 1px 0 rgba(0,0,0,0.3)",
      });
      const d = descCell(desc);
      row.append(cap, d);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private tokenRows(rows: [string, string][]): HTMLDivElement {
    const wrap = document.createElement("div");
    for (const [tok, desc] of rows) {
      const row = rowShell("baseline");
      const t = document.createElement("code");
      t.textContent = tok;
      Object.assign(t.style, {
        flex: "0 0 auto",
        minWidth: "82px",
        color: THEME.cyan,
        background: "rgba(138,110,255,0.12)",
        border: `1px solid ${THEME.borderBright}`,
        borderRadius: "6px",
        padding: "1px 8px",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "12px",
        whiteSpace: "nowrap",
      });
      const d = descCell(desc);
      row.append(t, d);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private shapeRows(): HTMLDivElement {
    const wrap = document.createElement("div");
    for (const s of SHAPES) {
      const row = rowShell("center");
      row.appendChild(shapeIcon(s.shape));
      const name = document.createElement("span");
      name.innerHTML =
        `<span style="color:${THEME.fg}">${s.kind}</span>` +
        `<span style="color:${THEME.dim}"> · ${shapeName(s.shape)}</span>`;
      name.style.fontSize = "12.5px";
      const acr = document.createElement("span");
      acr.textContent = s.acr;
      Object.assign(acr.style, {
        marginLeft: "auto",
        color: THEME.dim,
        fontSize: "10.5px",
        letterSpacing: "0.08em",
      });
      row.append(name, acr);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private legendRows(): HTMLDivElement {
    const wrap = document.createElement("div");
    const dot = (c: string): string =>
      `<span style="color:${c};text-shadow:0 0 6px ${c}">●</span>`;
    const rows: [string, string][] = [
      [dot(THEME.accent), "an object's hue = its current <b>group</b> (group-by mode)"],
      [dot(statusColor("ok")), "healthy pod (ok)"],
      [dot(statusColor("warning")), "pod warning"],
      [dot(statusColor("error")), "pod error"],
      ["◯", "colored nebula = a group (enclosing halo)"],
      ["⦿", "white ring = selected object"],
    ];
    for (const [glyph, desc] of rows) {
      const row = rowShell("baseline");
      const g = document.createElement("span");
      g.innerHTML = glyph;
      Object.assign(g.style, {
        flex: "0 0 auto",
        width: "18px",
        textAlign: "center",
        color: THEME.fg,
      });
      const d = document.createElement("span");
      d.innerHTML = desc;
      d.style.color = THEME.fg2;
      d.style.fontSize = "12.5px";
      row.append(g, d);
      wrap.appendChild(row);
    }
    return wrap;
  }
}

function shapeIcon(shape: ShapeKind): HTMLCanvasElement {
  const px = 26;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = px * dpr;
  canvas.height = px * dpr;
  Object.assign(canvas.style, { width: `${px}px`, height: `${px}px`, flex: "0 0 auto" });
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const c = px / 2;
  const r = px * 0.36;
  ctx.fillStyle = THEME.accent;
  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";

  // Regular n-gon, point-up by default.
  const poly = (n: number, rot = -Math.PI / 2, rad = r): void => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const x = c + rad * Math.cos(a);
      const y = c + rad * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  switch (shape) {
    case "sphere": {
      const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, THEME.accent);
      g.addColorStop(1, THEME.brand);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "cube":
      ctx.beginPath();
      ctx.roundRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7, 3);
      ctx.fill();
      break;
    case "octahedron": // diamond (4-gon)
      poly(4);
      ctx.fill();
      break;
    case "icosahedron": // hexagon
      poly(6, -Math.PI / 2);
      ctx.fill();
      break;
    case "dodecahedron": // pentagon
      poly(5);
      ctx.fill();
      break;
    case "tetrahedron": // triangle
      poly(3);
      ctx.fill();
      break;
    case "torus": // ring
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.arc(c, c, r * 0.5, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      break;
    case "cone": // triangle with a rounded base
      ctx.beginPath();
      ctx.moveTo(c, c - r);
      ctx.lineTo(c + r * 0.85, c + r * 0.7);
      ctx.quadraticCurveTo(c, c + r, c - r * 0.85, c + r * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    case "cylinder": // rectangle + top ellipse
      ctx.beginPath();
      ctx.roundRect(c - r * 0.7, c - r * 0.75, r * 1.4, r * 1.5, 3);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(c, c - r * 0.75, r * 0.7, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "knot": { // two interlaced loops
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(c, c, r, r * 0.5, Math.PI / 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c, c, r, r * 0.5, -Math.PI / 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  return canvas;
}
