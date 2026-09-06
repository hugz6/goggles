import { Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending } from "three";

// Glowing ring around the selected entity. Hidden by default.
export function buildSelectionMarker(): Sprite {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.stroke();

  const material = new SpriteMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false, // always visible, even behind a nebula
    blending: AdditiveBlending,
  });
  const sprite = new Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 999;
  return sprite;
}
