// "describe" overlay: renders the selected entity's data as sections.

import { THEME, ensureStyles, legendTitle, statusColor } from "./theme";

export interface DetailSection {
  title: string;
  rows: [string, string][];
  accentKey?: boolean; // highlight the key column (relations, containers…)
}

export interface DetailAction {
  label: string;
  onClick: () => void;
}

export interface DetailData {
  kind: string; // overline (type)
  title: string; // main title (name)
  sections: DetailSection[];
  actions?: DetailAction[]; // header buttons (logs, events…)
}

export class DetailView {
  private readonly backdrop: HTMLDivElement;
  private readonly panel: HTMLDivElement;

  constructor() {
    ensureStyles();
    this.backdrop = document.createElement("div");
    Object.assign(this.backdrop.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(2,4,3,0.62)",
      backdropFilter: "blur(3px)",
      zIndex: "50",
    });
    this.backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === this.backdrop) {
        this.hide(); // click outside the panel = close
      }
    });

    this.panel = document.createElement("div");
    Object.assign(this.panel.style, {
      position: "relative",
      width: "min(720px, 92vw)",
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
    this.backdrop.appendChild(this.panel);
    document.body.appendChild(this.backdrop);

    // capture: runs before nav sees Escape; freezes other keys while open
    const onKeyDown = (e: KeyboardEvent): void => {
      if (this.backdrop.style.display === "none") {
        return;
      }
      if (e.key === "Escape") {
        this.hide();
      }
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
  }

  hide(): void {
    this.backdrop.style.display = "none";
  }

  show(data: DetailData): void {
    this.panel.replaceChildren(legendTitle("describe", THEME.cyan), this.header(data), this.scroll(data));
    this.backdrop.style.display = "flex";
  }

  private header(data: DetailData): HTMLDivElement {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex",
      alignItems: "baseline",
      gap: "10px",
      padding: "16px 16px 12px",
      borderBottom: `1px solid ${THEME.border}`,
    });

    const kind = document.createElement("span");
    kind.textContent = data.kind;
    Object.assign(kind.style, {
      color: THEME.accent,
      textTransform: "uppercase",
      fontSize: "11px",
      letterSpacing: "0.1em",
    });

    const title = document.createElement("span");
    title.textContent = data.title;
    title.style.fontSize = "18px";
    title.style.fontWeight = "600";

    const actions = document.createElement("span");
    Object.assign(actions.style, { marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" });
    for (const a of data.actions ?? []) {
      const btn = document.createElement("button");
      btn.textContent = a.label;
      Object.assign(btn.style, {
        background: THEME.bgSolid,
        color: THEME.accent,
        border: `1px solid ${THEME.borderBright}`,
        borderRadius: "999px",
        padding: "3px 12px",
        font: "inherit",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.04em",
        cursor: "pointer",
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
      btn.addEventListener("click", a.onClick);
      actions.appendChild(btn);
    }

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
    close.addEventListener("click", () => this.hide());

    actions.appendChild(close);
    bar.append(kind, title, actions);
    return bar;
  }

  private scroll(data: DetailData): HTMLDivElement {
    const body = document.createElement("div");
    Object.assign(body.style, { padding: "6px 13px 12px", overflowY: "auto" });
    for (const s of data.sections) {
      body.appendChild(this.section(s));
    }
    return body;
  }

  private section(s: DetailSection): HTMLDivElement {
    const sec = document.createElement("div");
    sec.style.margin = "10px 0 2px";

    const h = document.createElement("div");
    h.textContent = s.title;
    Object.assign(h.style, {
      color: THEME.accent,
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      marginBottom: "6px",
    });
    sec.appendChild(h);

    if (s.rows.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "-";
      empty.style.color = THEME.dim;
      sec.appendChild(empty);
      return sec;
    }

    for (const [key, val] of s.rows) {
      const row = document.createElement("div");
      Object.assign(row.style, { display: "flex", gap: "10px", padding: "1px 0" });
      const k = document.createElement("span");
      k.textContent = key;
      Object.assign(k.style, {
        color: s.accentKey ? THEME.accent : THEME.dim,
        flex: "0 0 40%",
        maxWidth: "40%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      const v = document.createElement("span");
      v.textContent = val;
      Object.assign(v.style, { flex: "1", wordBreak: "break-all" });
      if (val === "ok" || val === "warning" || val === "error") {
        v.style.color = statusColor(val);
        v.style.textShadow = `0 0 6px ${statusColor(val)}`;
      }
      row.append(k, v);
      sec.appendChild(row);
    }
    return sec;
  }
}
