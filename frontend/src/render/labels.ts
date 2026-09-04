// Acronym labels (POD, SVC, DEP…) shown above entities of the focused group.

import {
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  LinearFilter,
  Vector3,
} from "three";
import type { PerspectiveCamera } from "three";
import type { Vec3 } from "../layout/types";
import { kindAcronym } from "../nav/kind";

// occluder must be clearly in front (by OCC_MARGIN) of the labeled entity
const NODE_R_WORLD = 2.2;
const OCC_MARGIN = 2.5;

const textureCache = new Map<string, CanvasTexture>();

function acronymTexture(acronym: string): CanvasTexture {
  const cached = textureCache.get(acronym);
  if (cached) {
    return cached;
  }
  const w = 256;
  const h = 112;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 60px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tw = ctx.measureText(acronym).width;
  const pillW = tw + 52;
  const pillH = 80;
  const x0 = (w - pillW) / 2;
  const y0 = (h - pillH) / 2;
  ctx.beginPath();
  ctx.roundRect(x0, y0, pillW, pillH, 14);
  ctx.fillStyle = "rgba(4,14,11,0.82)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(40,255,188,0.55)";
  ctx.stroke();

  const cy = h / 2 + 3;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.9)"; // black outline: contrast on a light background
  ctx.strokeText(acronym, w / 2, cy);
  ctx.shadowColor = "rgba(40,255,188,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#eafff7";
  ctx.fillText(acronym, w / 2, cy);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter; // avoids blurry mipmaps on text
  textureCache.set(acronym, texture);
  return texture;
}

interface EntityLabel {
  id: string;
  base: Vec3;
  sprite: Sprite;
}

const GAP_X = 46; // min screen gap between two labels
const GAP_Y = 22;

export class LabelLayer {
  readonly group = new Group();
  private labels: EntityLabel[] = [];
  private readonly proj = new Vector3(); // scratch for screen projection

  constructor() {
    this.group.visible = false;
  }

  reset(entities: { id: string; kind: string; base: Vec3 }[]): void {
    this.group.clear();
    this.labels = entities.map(({ id, kind, base }) => {
      const material = new SpriteMaterial({
        map: acronymTexture(kindAcronym(kind)),
        transparent: true,
        depthWrite: false,
        depthTest: false, // always legible, even behind a star
      });
      const sprite = new Sprite(material);
      sprite.scale.set(10, 4.4, 1);
      this.group.add(sprite);
      return { id, base, sprite };
    });
  }

  setPositions(spreadPoint: (base: Vec3) => Vec3, yOffset: number): void {
    for (const { base, sprite } of this.labels) {
      const p = spreadPoint(base);
      sprite.position.set(p.x, p.y + yOffset, p.z);
    }
  }

  setFocus(focusBase: Vec3, radius: number): void {
    for (const { base, sprite } of this.labels) {
      const d = Math.hypot(base.x - focusBase.x, base.y - focusBase.y, base.z - focusBase.z);
      const t = Math.min(d / radius, 1);
      const opacity = 1 - t * t * (3 - 2 * t); // inverted smoothstep: 1 -> 0
      sprite.material.opacity = opacity;
      sprite.visible = opacity > 0.02;
    }
  }

  // Two passes: hide labels occluded by a closer node, then anti-stack the
  // survivors (closest wins its screen cell). occluders = visible node positions.
  declutter(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    occluders: Map<string, Vec3>,
  ): void {
    // node screen radius = R_world * projScale / dist
    const projScale = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;

    type Occ = { id: string; sx: number; sy: number; dist: number; r: number };
    const occ: Occ[] = [];
    const occById = new Map<string, Occ>();
    for (const [id, p] of occluders) {
      this.proj.set(p.x, p.y, p.z).project(camera);
      if (this.proj.z > 1) {
        continue; // behind the camera
      }
      const dist = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      const o: Occ = {
        id,
        sx: (this.proj.x * 0.5 + 0.5) * width,
        sy: (-this.proj.y * 0.5 + 0.5) * height,
        dist,
        r: (NODE_R_WORLD * projScale) / dist,
      };
      occ.push(o);
      occById.set(id, o);
    }

    type Cell = { sprite: Sprite; id: string; sx: number; sy: number; dist: number };
    const items: Cell[] = [];
    for (const { id, sprite } of this.labels) {
      if (!occluders.has(id)) {
        sprite.visible = false;
        continue;
      }
      if (sprite.material.opacity <= 0.05) {
        continue; // already faded by distance: leave it
      }
      this.proj.copy(sprite.position).project(camera);
      if (this.proj.z > 1) {
        sprite.visible = false;
        continue;
      }
      items.push({
        sprite,
        id,
        sx: (this.proj.x * 0.5 + 0.5) * width,
        sy: (-this.proj.y * 0.5 + 0.5) * height,
        dist: sprite.position.distanceTo(camera.position),
      });
    }

    const survivors: Cell[] = [];
    for (const it of items) {
      const self = occById.get(it.id);
      const esx = self ? self.sx : it.sx;
      const esy = self ? self.sy : it.sy;
      const edist = self ? self.dist : it.dist;
      const behind = occ.some(
        (o) =>
          o.id !== it.id &&
          o.dist < edist - OCC_MARGIN &&
          Math.abs(o.sx - esx) < o.r &&
          Math.abs(o.sy - esy) < o.r,
      );
      if (behind) {
        it.sprite.visible = false;
      } else {
        survivors.push(it);
      }
    }

    survivors.sort((a, b) => a.dist - b.dist);
    const shown: Cell[] = [];
    for (const it of survivors) {
      const clash = shown.some(
        (s) => Math.abs(it.sx - s.sx) < GAP_X && Math.abs(it.sy - s.sy) < GAP_Y,
      );
      it.sprite.visible = !clash;
      if (!clash) {
        shown.push(it);
      }
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}
