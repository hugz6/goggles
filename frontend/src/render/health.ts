// Pulsing glow around each unhealthy pod. Red = error, amber = warning.

import {
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  AdditiveBlending,
  Color,
} from "three";
import type { Graph, GraphNode } from "../api/client";
import { ORIGIN } from "../layout/types";
import type { Layout, Vec3 } from "../layout/types";

const ERROR_COLOR = new Color(0xff2233);
const WARNING_COLOR = new Color(0xffaa22);

function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

interface Aura {
  id: string;
  base: Vec3;
  center: Vec3; // group center, reference for the spread
  sprite: Sprite;
  error: boolean; // red pulses stronger than amber
}

export class HealthAura {
  readonly group = new Group();
  private auras: Aura[] = [];
  private hidden: ((id: string) => boolean) | null = null;

  setHidden(fn: ((id: string) => boolean) | null): void {
    this.hidden = fn;
  }

  constructor(
    graph: Graph,
    layout: Layout,
    centerByNs: Map<string, Vec3>,
    groupKey: (n: GraphNode) => string = (n) => n.namespace ?? "",
  ) {
    const texture = glowTexture();
    for (const n of graph.nodes) {
      if (n.kind !== "Pod" || !n.health || n.health === "ok") {
        continue;
      }
      const base = layout.get(n.id);
      if (!base) {
        continue;
      }
      const error = n.health === "error";
      const material = new SpriteMaterial({
        map: texture,
        color: error ? ERROR_COLOR : WARNING_COLOR,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      this.group.add(sprite);
      this.auras.push({ id: n.id, base, center: centerByNs.get(groupKey(n)) ?? ORIGIN, sprite, error });
    }
  }

  update(spreadAt: (center: Vec3) => number, time: number): void {
    for (const { id, base, center, sprite, error } of this.auras) {
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
      const speed = error ? 6 : 3;
      const pulse = 0.5 + 0.5 * Math.sin(time * speed);
      const material = sprite.material as SpriteMaterial;
      material.opacity = error ? 0.4 + 0.5 * pulse : 0.3 + 0.3 * pulse;
      const size = (error ? 7 : 5) + pulse * (error ? 3 : 1.5);
      sprite.scale.set(size, size, 1);
    }
  }
}
