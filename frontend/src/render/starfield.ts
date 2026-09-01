// Background starfield: a shell of points enveloping the galaxy, for depth.

import {
  Points,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  CanvasTexture,
  AdditiveBlending,
  Color,
} from "three";

function starTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

const PALETTE = [
  new Color(0xbfd8ff),
  new Color(0xffffff),
  new Color(0x9ff5d0),
  new Color(0x8fdcff),
  new Color(0xffe6c0),
];

export function buildStarfield(count = 2000, radius = 3600): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.55 + Math.random() * 0.45); // biased to the outer shell
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.cos(theta);

    const c = PALETTE[(Math.random() * PALETTE.length) | 0];
    const b = 0.35 + Math.random() * 0.65; // varied brightness
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 9,
    map: starTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false; // the shell encloses the camera
  return points;
}
