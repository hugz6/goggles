// Shared "Proton" theme: dark violet surfaces, rounded corners, Inter sans.

export const THEME = {
  fg: "#ECEAF6", // primary text
  dim: "#9793AC", // secondary text / labels
  accent: "#8A6EFF", // vivid Proton violet - selection, focus, links
  brand: "#6D4AFF", // brand violet (filled buttons)
  cyan: "#A78BFF", // light violet (secondary titles / describe)
  amber: "#FFB84D", // warning
  error: "#F5556B", // error / no match
  ok: "#3DDC97", // success (health ok)
  fg2: "#B8B4CB", // dimmed values
  bg: "rgba(25,23,36,0.90)", // panel surface (violet-navy, translucent)
  bgSolid: "#191724", // opaque variant (masks, chips)
  bgInput: "rgba(255,255,255,0.05)", // field background
  border: "rgba(255,255,255,0.08)", // hairline border
  borderBright: "rgba(138,110,255,0.45)", // violet-tinted (accent) border
  borderInput: "rgba(255,255,255,0.12)",
  font: "13.5px/1.55 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

let stylesInjected = false;

export function ensureStyles(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes g5s-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .g5s-cap { display: inline-flex; align-items: center; gap: 6px; margin-right: 13px; white-space: nowrap; }
    .g5s-cap b {
      color: ${THEME.fg}; background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.14); border-radius: 5px;
      padding: 1px 6px; font-weight: 600; font-size: 0.82em; letter-spacing: 0.01em;
      box-shadow: 0 1px 0 rgba(0,0,0,0.3);
    }
    .g5s-cap span { color: ${THEME.dim}; }

    /* below 700px the corner panels would overlap: stack them */
    @media (max-width: 700px) {
      .g5s-filter {
        top: 12px !important; left: 12px !important; right: 12px !important;
        width: auto !important; max-width: none !important;
      }
      .g5s-filter-body { max-height: 42vh !important; }
      .g5s-select {
        top: auto !important; bottom: 74px !important;
        left: 12px !important; right: 12px !important;
        min-width: 0 !important; width: auto !important; max-width: none !important;
      }
      .g5s-hud { max-width: calc(100vw - 24px) !important; padding: 7px 14px !important; gap: 10px !important; }
      .g5s-hud-keys { display: none !important; }
    }
    @media (max-width: 400px) {
      .g5s-panel { font-size: 12.5px !important; }
    }
  `;
  document.head.appendChild(s);
}

export function statusColor(health?: string): string {
  if (health === "error") {
    return THEME.error;
  }
  if (health === "warning") {
    return THEME.amber;
  }
  return THEME.ok;
}

// Doesn't set `position` - the caller does (fixed or relative), both of which
// give the absolute legend chip its positioning context.
export function panelStyle(): Partial<CSSStyleDeclaration> {
  ensureStyles();
  return {
    font: THEME.font,
    color: THEME.fg,
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: "14px",
    boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
    backdropFilter: "blur(18px)",
    animation: "g5s-rise 0.26s cubic-bezier(0.2,0.8,0.2,1) both",
  };
}

export function legendTitle(label: string, color: string = THEME.accent): HTMLDivElement {
  const chip = document.createElement("div");
  Object.assign(chip.style, {
    position: "absolute",
    top: "-11px",
    left: "16px",
    padding: "3px 11px",
    background: THEME.bgSolid,
    color,
    fontSize: "10.5px",
    fontWeight: "600",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    borderRadius: "8px",
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  });
  chip.textContent = label;
  return chip;
}

export function keyCapHTML(key: string, label: string): string {
  return `<span class="g5s-cap"><b>${key}</b><span>${label}</span></span>`;
}
