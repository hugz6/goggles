// Shown on boot when no data source is active yet. Blocking: no close, no
// Escape. Reloads the page once a context is selected.

import { THEME, ensureStyles, legendTitle } from "./theme";
import { fetchContexts, selectContext } from "../api/contexts";

export class ContextPicker {
  private readonly backdrop: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLDivElement;

  constructor() {
    ensureStyles();
    this.backdrop = document.createElement("div");
    Object.assign(this.backdrop.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(10,8,18,0.72)",
      backdropFilter: "blur(4px)",
      zIndex: "100",
    });
    this.backdrop.addEventListener("keydown", (e) => e.stopPropagation());

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "relative",
      width: "min(420px, 92vw)",
      maxHeight: "80vh",
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
    panel.appendChild(legendTitle("select context", THEME.accent));

    const title = document.createElement("div");
    title.textContent = "Which cluster?";
    Object.assign(title.style, {
      fontSize: "16px",
      fontWeight: "600",
      padding: "18px 20px 4px",
    });

    const sub = document.createElement("div");
    sub.textContent = "Pick a kubeconfig context to explore.";
    Object.assign(sub.style, {
      color: THEME.dim,
      fontSize: "12px",
      padding: "0 20px 14px",
    });

    this.list = document.createElement("div");
    Object.assign(this.list.style, {
      padding: "0 12px 12px",
      overflowY: "auto",
    });

    this.status = document.createElement("div");
    Object.assign(this.status.style, {
      color: THEME.dim,
      fontSize: "12px",
      padding: "0 20px 18px",
      minHeight: "16px",
    });

    panel.append(title, sub, this.list, this.status);
    this.backdrop.appendChild(panel);
    document.body.appendChild(this.backdrop);
  }

  async show(): Promise<void> {
    this.backdrop.style.display = "flex";
    this.status.textContent = "loading contexts…";
    try {
      const { contexts, current } = await fetchContexts();
      this.status.textContent = "";
      if (contexts.length === 0) {
        this.status.textContent = "No kube context found. Check your kubeconfig.";
        return;
      }
      this.renderRows(contexts, current);
    } catch (err) {
      this.status.textContent = "⚠ " + (err instanceof Error ? err.message : "failed to list contexts");
    }
  }

  private renderRows(contexts: string[], current: string): void {
    this.list.replaceChildren();
    for (const name of contexts) {
      const row = document.createElement("button");
      row.type = "button";
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        textAlign: "left",
        padding: "9px 12px",
        margin: "2px 0",
        background: "transparent",
        color: THEME.fg,
        border: "none",
        borderRadius: "9px",
        cursor: "pointer",
        font: "inherit",
        fontSize: "13px",
        transition: "background 0.12s",
      });
      row.addEventListener("mouseenter", () => (row.style.background = "rgba(138,110,255,0.14)"));
      row.addEventListener("mouseleave", () => (row.style.background = "transparent"));

      const dot = document.createElement("span");
      dot.textContent = "●";
      Object.assign(dot.style, {
        color: name === current ? THEME.ok : THEME.dim,
        fontSize: "9px",
      });
      const label = document.createElement("span");
      label.textContent = name;
      row.append(dot, label);
      if (name === current) {
        const tag = document.createElement("span");
        tag.textContent = "current";
        Object.assign(tag.style, {
          marginLeft: "auto",
          color: THEME.dim,
          fontSize: "10.5px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        });
        row.appendChild(tag);
      }

      row.addEventListener("click", () => this.pick(name));
      this.list.appendChild(row);
    }
  }

  private async pick(name: string): Promise<void> {
    for (const child of Array.from(this.list.children)) {
      (child as HTMLButtonElement).disabled = true;
    }
    this.status.textContent = `connecting to ${name}…`;
    try {
      await selectContext(name);
      location.reload();
    } catch (err) {
      this.status.textContent = "⚠ " + (err instanceof Error ? err.message : "connection failed");
      for (const child of Array.from(this.list.children)) {
        (child as HTMLButtonElement).disabled = false;
      }
    }
  }
}
