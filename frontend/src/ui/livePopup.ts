// Live popups opened from the describe view: logs (WebSocket) and events.

import { THEME, ensureStyles, legendTitle } from "./theme";
import { openLogSocket, fetchEvents } from "../api/live";
import type { EventItem } from "../api/live";

// case-insensitive substring, or /regex/ when wrapped
function makeMatcher(q: string): (line: string) => boolean {
  const t = q.trim();
  if (!t) {
    return () => true;
  }
  if (t.length > 2 && t.startsWith("/") && t.endsWith("/")) {
    try {
      const re = new RegExp(t.slice(1, -1), "i");
      return (l) => re.test(l);
    } catch {
      // invalid regex -> fall back to substring search
    }
  }
  const lc = t.toLowerCase();
  return (l) => l.toLowerCase().includes(lc);
}

interface Item {
  text: string; // text searched by grep
  el: HTMLElement; // rendered line
}

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

abstract class GrepPopup {
  protected readonly backdrop: HTMLDivElement;
  protected readonly controls: HTMLDivElement;
  protected readonly status: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly grep: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly titleEl: HTMLSpanElement;
  private items: Item[] = [];
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(legend: string, color: string, private readonly cap: number) {
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
      zIndex: "70",
    });
    this.backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      position: "relative",
      width: "min(880px, 94vw)",
      height: "min(680px, 86vh)",
      display: "flex",
      flexDirection: "column",
      font: THEME.font,
      color: THEME.fg,
      background: THEME.bg,
      border: `1px solid ${THEME.border}`,
      borderRadius: "16px",
      boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
      backdropFilter: "blur(20px)",
      animation: "g5s-rise 0.22s cubic-bezier(0.2,0.8,0.2,1) both",
    });
    card.appendChild(legendTitle(legend, color));

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "15px 16px 11px",
      borderBottom: `1px solid ${THEME.border}`,
      flexWrap: "wrap",
    });
    this.titleEl = document.createElement("span");
    this.titleEl.style.fontSize = "15px";
    this.titleEl.style.fontWeight = "600";
    this.status = document.createElement("span");
    Object.assign(this.status.style, { color: THEME.dim, fontSize: "11px" });
    this.controls = document.createElement("div");
    Object.assign(this.controls.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginLeft: "auto",
    });
    const close = document.createElement("button");
    close.textContent = "✕";
    Object.assign(close.style, {
      background: "transparent",
      color: THEME.dim,
      border: "none",
      cursor: "pointer",
      font: "inherit",
      fontSize: "14px",
    });
    close.addEventListener("mouseenter", () => (close.style.color = THEME.error));
    close.addEventListener("mouseleave", () => (close.style.color = THEME.dim));
    close.addEventListener("click", () => this.close());
    header.append(this.titleEl, this.status, this.controls, close);

    const grepRow = document.createElement("div");
    Object.assign(grepRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "9px 16px",
      borderBottom: `1px solid ${THEME.border}`,
    });
    const glyph = document.createElement("span");
    glyph.textContent = "⌕";
    Object.assign(glyph.style, { color: THEME.dim, fontSize: "15px" });
    this.grep = document.createElement("input");
    this.grep.type = "text";
    this.grep.placeholder = "grep…  (substring, or /regex/)";
    this.grep.spellcheck = false;
    Object.assign(this.grep.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      background: THEME.bgInput,
      color: THEME.fg,
      border: `1px solid ${THEME.borderInput}`,
      borderRadius: "9px",
      padding: "5px 10px",
      font: MONO,
      fontSize: "12px",
      outline: "none",
    });
    this.grep.addEventListener("input", () => this.applyGrep());
    this.grep.addEventListener("keydown", (e) => e.stopPropagation()); // don't drive the scene
    this.count = document.createElement("span");
    Object.assign(this.count.style, { color: THEME.dim, fontSize: "10.5px", whiteSpace: "nowrap" });
    grepRow.append(glyph, this.grep, this.count);

    this.body = document.createElement("div");
    Object.assign(this.body.style, {
      flex: "1",
      minHeight: "0",
      overflow: "auto",
      padding: "8px 16px 14px",
      font: MONO,
      fontSize: "12px",
      lineHeight: "1.5",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });

    card.append(header, grepRow, this.body);
    this.backdrop.appendChild(card);
    document.body.appendChild(this.backdrop);

    this.onKeyDown = (e) => {
      if (!this.isOpen()) {
        return;
      }
      if (e.key === "Escape") {
        this.close();
        e.preventDefault();
      }
      e.stopPropagation();
    };
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  isOpen(): boolean {
    return this.backdrop.style.display !== "none";
  }

  protected openCard(title: string): void {
    this.titleEl.textContent = title;
    this.grep.value = "";
    this.clearItems();
    this.backdrop.style.display = "flex";
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.backdrop.style.display = "none";
    this.onClosed();
  }

  protected onClosed(): void {} // e.g. closes a WebSocket; no-op by default

  protected clearItems(): void {
    this.items = [];
    this.body.replaceChildren();
    this.count.textContent = "";
  }

  protected addItem(text: string, el: HTMLElement): void {
    const atBottom = this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 40;
    this.items.push({ text, el });
    this.body.appendChild(el);
    if (this.items.length > this.cap) {
      const old = this.items.shift();
      old?.el.remove();
    }
    const shown = makeMatcher(this.grep.value)(text);
    el.style.display = shown ? "" : "none";
    this.updateCount();
    if (atBottom && shown) {
      this.body.scrollTop = this.body.scrollHeight;
    }
  }

  private applyGrep(): void {
    const m = makeMatcher(this.grep.value);
    for (const it of this.items) {
      it.el.style.display = m(it.text) ? "" : "none";
    }
    this.updateCount();
  }

  private updateCount(): void {
    const m = makeMatcher(this.grep.value);
    const shown = this.items.reduce((n, it) => n + (m(it.text) ? 1 : 0), 0);
    this.count.textContent = this.grep.value.trim()
      ? `${shown}/${this.items.length}`
      : `${this.items.length}`;
  }
}

// --- Logs ---

export interface LogsContext {
  namespace: string;
  pod: string;
  containers: string[];
}

export class LogsPopup extends GrepPopup {
  private ws: WebSocket | null = null;
  private ctx: LogsContext | null = null;
  private readonly select: HTMLSelectElement;
  private readonly prevBox: HTMLInputElement;

  constructor() {
    super("logs", THEME.accent, 8000);
    this.select = document.createElement("select");
    Object.assign(this.select.style, {
      background: THEME.bgInput,
      color: THEME.fg,
      border: `1px solid ${THEME.borderInput}`,
      borderRadius: "8px",
      padding: "3px 8px",
      font: "inherit",
      fontSize: "11px",
      cursor: "pointer",
    });
    this.select.addEventListener("change", () => this.connect());

    const prevLabel = document.createElement("label");
    Object.assign(prevLabel.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      color: THEME.dim,
      fontSize: "11px",
      cursor: "pointer",
    });
    this.prevBox = document.createElement("input");
    this.prevBox.type = "checkbox";
    this.prevBox.addEventListener("change", () => this.connect());
    prevLabel.append(this.prevBox, document.createTextNode("previous"));

    this.controls.append(this.select, prevLabel);
  }

  open(ctx: LogsContext): void {
    this.ctx = ctx;
    this.openCard(ctx.pod);
    this.select.replaceChildren();
    for (const c of ctx.containers.length ? ctx.containers : [""]) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c || "(default)";
      this.select.appendChild(opt);
    }
    this.prevBox.checked = false;
    this.connect();
  }

  private connect(): void {
    this.ws?.close();
    this.ws = null;
    this.clearItems();
    if (!this.ctx) {
      return;
    }
    this.status.textContent = "connecting…";
    this.status.style.color = THEME.dim;
    const ws = openLogSocket(
      {
        namespace: this.ctx.namespace,
        pod: this.ctx.pod,
        container: this.select.value,
        previous: this.prevBox.checked,
      },
      (line) => this.addLine(line),
      () => {
        if (this.ws === ws) {
          this.status.textContent = "● closed";
          this.status.style.color = THEME.dim;
        }
      },
    );
    ws.addEventListener("open", () => {
      if (this.ws === ws) {
        this.status.textContent = "● live";
        this.status.style.color = THEME.ok;
      }
    });
    this.ws = ws;
  }

  private addLine(line: string): void {
    const el = document.createElement("div");
    el.textContent = line;
    el.style.color = THEME.fg2;
    this.addItem(line, el);
  }

  protected onClosed(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// --- Events ---

export interface EventsContext {
  namespace: string;
  uid: string;
  title: string;
}

export class EventsPopup extends GrepPopup {
  private ctx: EventsContext | null = null;

  constructor() {
    super("events", THEME.cyan, 2000);
    const refresh = document.createElement("button");
    refresh.textContent = "↻ refresh";
    Object.assign(refresh.style, {
      background: THEME.bgSolid,
      color: THEME.accent,
      border: `1px solid ${THEME.borderBright}`,
      borderRadius: "999px",
      padding: "3px 11px",
      font: "inherit",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
    });
    refresh.addEventListener("click", () => this.load());
    this.controls.append(refresh);
  }

  open(ctx: EventsContext): void {
    this.ctx = ctx;
    this.openCard(ctx.title);
    this.load();
  }

  private async load(): Promise<void> {
    if (!this.ctx) {
      return;
    }
    this.clearItems();
    this.status.textContent = "loading…";
    this.status.style.color = THEME.dim;
    try {
      const events = await fetchEvents(this.ctx.namespace, this.ctx.uid);
      this.status.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
      if (events.length === 0) {
        this.addNote("no events for this object");
        return;
      }
      for (const ev of events) {
        this.addEvent(ev);
      }
    } catch (err) {
      this.status.textContent = "";
      this.addNote("⚠ " + (err instanceof Error ? err.message : "failed"));
    }
  }

  private addEvent(ev: EventItem): void {
    const warn = ev.type === "Warning";
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "10px", padding: "3px 0", alignItems: "baseline" });
    const meta = document.createElement("span");
    Object.assign(meta.style, {
      flex: "0 0 auto",
      minWidth: "180px",
      color: warn ? THEME.error : THEME.dim,
    });
    const times = ev.count > 1 ? ` ×${ev.count}` : "";
    meta.textContent = `${warn ? "⚠" : "*"} ${ev.reason}${times} · ${ev.age}`;
    const msg = document.createElement("span");
    msg.style.color = THEME.fg2;
    msg.textContent = ev.message + (ev.source ? `  - ${ev.source}` : "");
    row.append(meta, msg);
    this.addItem(`${ev.type} ${ev.reason} ${ev.message} ${ev.source}`, row);
  }

  private addNote(text: string): void {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.color = THEME.dim;
    this.addItem(text, el);
  }
}
