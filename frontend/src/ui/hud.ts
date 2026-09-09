import { THEME, ensureStyles, keyCapHTML } from "./theme";

export class Hud {
  private readonly footer: HTMLDivElement;

  constructor() {
    ensureStyles();
    this.footer = document.createElement("div");
    this.footer.className = "g5s-hud";
    Object.assign(this.footer.style, {
      position: "fixed",
      left: "50%",
      bottom: "16px",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      maxWidth: "94vw",
      boxSizing: "border-box",
      padding: "8px 16px",
      font: THEME.font,
      fontSize: "12px",
      color: THEME.fg,
      background: THEME.bg,
      border: `1px solid ${THEME.border}`,
      borderRadius: "999px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      backdropFilter: "blur(18px)",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      overflow: "hidden",
      animation: "g5s-rise 0.4s cubic-bezier(0.2,0.8,0.2,1) both",
    });

    const brand = document.createElement("span");
    brand.style.display = "inline-flex";
    brand.style.alignItems = "center";
    brand.style.gap = "8px";
    brand.innerHTML =
      `<span style="display:inline-block;width:16px;height:16px;border-radius:6px;` +
      `background:linear-gradient(135deg,${THEME.accent},${THEME.brand});` +
      `box-shadow:0 0 12px rgba(138,110,255,0.5)"></span>` +
      `<b style="color:${THEME.fg};font-weight:600;letter-spacing:0.02em">g5s</b>` +
      `<span style="color:${THEME.dim};font-size:10px;letter-spacing:0.08em">GOGGLES</span>`;

    const sep = document.createElement("span");
    sep.className = "g5s-hud-keys"; // hidden with the shortcuts on touch
    sep.textContent = "|";
    sep.style.color = THEME.dim;

    const keys = document.createElement("span");
    keys.className = "g5s-hud-keys";
    keys.innerHTML =
      keyCapHTML("Arrows", "move") +
      keyCapHTML("Q", "in") +
      keyCapHTML("W", "out") +
      keyCapHTML("E", "net") +
      keyCapHTML("O", "own") +
      keyCapHTML("/", "filter") +
      keyCapHTML("?", "help");

    this.footer.append(brand, sep, keys);
    document.body.appendChild(this.footer);
  }
}
