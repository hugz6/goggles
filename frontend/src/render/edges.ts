// Declared network edges, rendered as neon segments near the selection.

import {
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  AdditiveBlending,
  Color,
} from "three";
import type { Vec3 } from "../layout/types";

export interface NetEdge {
  from: string;
  to: string;
  kind: string; // "serves" | "allowed"
}

interface NodeInfo {
  base: Vec3;
  center: Vec3; // group center, reference for the spread
}

const COLOR: Record<string, Color> = {
  serves: new Color(0x33ddff), // cyan: Service serves pods
  allowed: new Color(0xff55ff), // magenta: NetworkPolicy allow
  owns: new Color(0xdfe6ff), // bluish white: ownership
  mounts: new Color(0x66ccff), // blue-cyan: storage mount (Pod -> PVC)
};

export class EdgeLayer {
  readonly object: LineSegments;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private active: NetEdge[] = [];
  private endpoints: { from: NodeInfo; to: NodeInfo }[] = [];

  constructor(
    private readonly edges: NetEdge[],
    private readonly info: Map<string, NodeInfo>,
  ) {
    this.positions = new Float32Array(Math.max(edges.length, 1) * 2 * 3);
    const colors = new Float32Array(this.positions.length);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, 0);

    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.object = new LineSegments(this.geometry, material);
    this.object.visible = false;
    this.object.frustumCulled = false; // positions update dynamically; default bounding sphere is wrong
  }

  // Keeps edges incident to the selection, plus those whose both endpoints are
  // near the focus. Called on selection change, not every frame.
  setActive(
    selId: string,
    focusBase: Vec3,
    radius: number,
    hidden: (id: string) => boolean = () => false,
  ): void {
    this.active = [];
    this.endpoints = [];
    const color = this.geometry.getAttribute("color") as Float32BufferAttribute;
    const r2 = radius * radius;
    let v = 0;
    for (const e of this.edges) {
      if (hidden(e.from) || hidden(e.to)) {
        continue;
      }
      const from = this.info.get(e.from);
      const to = this.info.get(e.to);
      if (!from || !to) {
        continue;
      }
      const incident = e.from === selId || e.to === selId;
      const local = dist2(from.base, focusBase) <= r2 && dist2(to.base, focusBase) <= r2;
      if (!incident && !local) {
        continue;
      }
      const c = COLOR[e.kind] ?? COLOR.serves;
      color.setXYZ(v, c.r, c.g, c.b);
      color.setXYZ(v + 1, c.r, c.g, c.b);
      v += 2;
      this.active.push(e);
      this.endpoints.push({ from, to });
    }
    color.needsUpdate = true;
    this.geometry.setDrawRange(0, this.active.length * 2);
  }

  update(spreadAt: (center: Vec3) => number): void {
    const pos = this.geometry.getAttribute("position") as Float32BufferAttribute;
    for (let i = 0; i < this.endpoints.length; i++) {
      const { from, to } = this.endpoints[i];
      writeSpread(pos, i * 2, from, spreadAt(from.center));
      writeSpread(pos, i * 2 + 1, to, spreadAt(to.center));
    }
    pos.needsUpdate = true;
  }

  setVisible(v: boolean): void {
    this.object.visible = v;
  }

  clear(): void {
    this.active = [];
    this.endpoints = [];
    this.geometry.setDrawRange(0, 0);
  }
}

function dist2(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function writeSpread(pos: Float32BufferAttribute, i: number, n: NodeInfo, s: number): void {
  pos.setXYZ(
    i,
    n.center.x + (n.base.x - n.center.x) * s,
    n.center.y + (n.base.y - n.center.y) * s,
    n.center.z + (n.base.z - n.center.z) * s,
  );
}
