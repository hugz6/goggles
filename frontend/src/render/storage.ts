// Glowing ring around each pod that mounts a PVC.

import {
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  AdditiveBlending,
  Color,
} from "three";
import { ORIGIN } from "../layout/types";
import type { Layout, Vec3 } from "../layout/types";

const RING_COLOR = new Color(0x66ccff);
const RING_SIZE = 5; // world diameter of the ring (encircles the pod)

function ringTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(255,255,255,0)");
  g.addColorStop(0.8, "rgba(255,255,255,1)"); // ring band
  g.addColorStop(0.92, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

interface Ring {
  id: string;
  base: Vec3;
  center: Vec3; // group center, reference for the spread
  sprite: Sprite;
}

export class StorageRing {
  readonly group = new Group();
  private rings: Ring[] = [];
  private hidden: ((id: string) => boolean) | null = null;

  setHidden(fn: ((id: string) => boolean) | null): void {
    this.hidden = fn;
  }

  constructor(
    podIds: Iterable<string>,
    layout: Layout,
    centerByNs: Map<string, Vec3>,
    namespaceOf: (id: string) => string,
  ) {
    const texture = ringTexture();
    for (const id of podIds) {
      const base = layout.get(id);
      if (!base) {
        continue;
      }
      const material = new SpriteMaterial({
        map: texture,
        color: RING_COLOR,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.scale.set(RING_SIZE, RING_SIZE, 1);
      this.group.add(sprite);
      this.rings.push({ id, base, center: centerByNs.get(namespaceOf(id)) ?? ORIGIN, sprite });
    }
  }

  update(spreadAt: (center: Vec3) => number): void {
    for (const { id, base, center, sprite } of this.rings) {
      if (this.hidden && this.hidden(id)) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const s = spreadAt(center);
      sprite.position.set(
        center.x + (base.x - center.x) * s,
        center.y + (base.y - center.y) * s,
        center.z + (base.z - center.z) * s,
      );
    }
  }
}
