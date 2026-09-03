import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Color,
  AdditiveBlending,
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
} from "three";
import type { Graph, GraphNode } from "../api/client";
import { ORIGIN } from "../layout/types";
import type { Layout, Vec3 } from "../layout/types";
import type { NamespaceCluster } from "../layout/clusters";
import { namespaceColor } from "./neon";
import { orbit } from "../layout/orbital";
import { geometryForKind } from "./shapes";

interface Instance {
  position: Vec3;
  center: Vec3; // group center, fixed point of the spread
  color: Color;
}

const DIM_FACTOR = 0.08; // floor brightness for nodes far from the focus

export interface SpreadMesh {
  mesh: InstancedMesh;
  setSpread(spreadAt: (center: Vec3) => number): void;
}

function buildSpheres(instances: Instance[], radius: number): SpreadMesh {
  const geometry = new SphereGeometry(radius, 16, 16);
  const material = new MeshBasicMaterial({ transparent: true, opacity: 1 });
  const mesh = new InstancedMesh(geometry, material, instances.length);
  // Bounding sphere defaults to the geometry's, at local origin - not the
  // instances, which sit far away. Would cull the whole mesh wrongly.
  mesh.frustumCulled = false;

  instances.forEach((inst, i) => mesh.setColorAt(i, inst.color));
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  const dummy = new Object3D();
  function setSpread(spreadAt: (center: Vec3) => number): void {
    instances.forEach((inst, i) => {
      const s = spreadAt(inst.center);
      dummy.position.set(
        inst.center.x + (inst.position.x - inst.center.x) * s,
        inst.center.y + (inst.position.y - inst.center.y) * s,
        inst.center.z + (inst.position.z - inst.center.z) * s,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  setSpread(() => 1);

  return { mesh, setSpread };
}

export interface NodeField {
  group: Group;
  worldPositions: Map<string, Vec3>; // for click selection
  setSpread(spreadAt: (center: Vec3) => number): void;
  spotlight(focus: Vec3 | null, radius: number): void;
  setHidden(hidden: ((id: string) => boolean) | null): void;
}

interface KindEntry {
  id: string;
  base: Vec3;
  center: Vec3;
  color: Color;
}

// One InstancedMesh per kind (one draw call per shape).
export function buildNodes(
  graph: Graph,
  layout: Layout,
  centerByNs: Map<string, Vec3>,
  groupKey: (n: GraphNode) => string = (n) => n.namespace ?? "",
): NodeField {
  const byKind = new Map<string, KindEntry[]>();
  for (const n of graph.nodes) {
    const group = groupKey(n);
    const entry: KindEntry = {
      id: n.id,
      base: layout.get(n.id) ?? ORIGIN,
      center: centerByNs.get(group) ?? ORIGIN,
      color: namespaceColor(group),
    };
    const arr = byKind.get(n.kind);
    if (arr) {
      arr.push(entry);
    } else {
      byKind.set(n.kind, [entry]);
    }
  }

  const group = new Group();
  const worldPositions = new Map<string, Vec3>();
  const meshes: { mesh: InstancedMesh; entries: KindEntry[] }[] = [];

  for (const [kind, entries] of byKind) {
    const geometry = geometryForKind(kind);
    const material =
      kind === "Pod"
        ? new MeshBasicMaterial({ transparent: true, opacity: 1 }) // unlit star
        : new MeshLambertMaterial({ emissive: 0x000000 }); // shaded, reads volume
    const mesh = new InstancedMesh(geometry, material, entries.length);
    mesh.frustumCulled = false; // see buildSpheres above
    entries.forEach((e, i) => mesh.setColorAt(i, e.color));
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    group.add(mesh);
    meshes.push({ mesh, entries });
  }

  let hiddenFn: ((id: string) => boolean) | null = null;
  function setHidden(fn: ((id: string) => boolean) | null): void {
    hiddenFn = fn;
  }

  const dummy = new Object3D();
  function setSpread(spreadAt: (center: Vec3) => number): void {
    for (const { mesh, entries } of meshes) {
      entries.forEach((e, i) => {
        const s = spreadAt(e.center);
        const x = e.center.x + (e.base.x - e.center.x) * s;
        const y = e.center.y + (e.base.y - e.center.y) * s;
        const z = e.center.z + (e.base.z - e.center.z) * s;
        const visible = !hiddenFn || !hiddenFn(e.id);
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(visible ? 1 : 0); // 0 hides it (kept out of picking too)
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (visible) {
          worldPositions.set(e.id, { x, y, z });
        } else {
          worldPositions.delete(e.id); // excluded from picking
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  setSpread(() => 1);

  function spotlight(focus: Vec3 | null, radius: number): void {
    for (const { mesh, entries } of meshes) {
      entries.forEach((e, i) => {
        let brightness = 1;
        if (focus) {
          const t = Math.min(
            Math.hypot(e.base.x - focus.x, e.base.y - focus.y, e.base.z - focus.z) / radius,
            1,
          );
          brightness = DIM_FACTOR + (1 - DIM_FACTOR) * (1 - t * t * (3 - 2 * t));
        }
        mesh.setColorAt(i, e.color.clone().multiplyScalar(brightness));
      });
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  return { group, worldPositions, setSpread, spotlight, setHidden };
}

// Near tier: each pod's containers in a tight orbit around it.
export function buildContainers(
  graph: Graph,
  layout: Layout,
  centerByNs: Map<string, Vec3>,
  groupKey: (n: GraphNode) => string = (n) => n.namespace ?? "",
): SpreadMesh {
  const instances: Instance[] = [];
  for (const n of graph.nodes) {
    if (!n.containers || n.containers.length === 0) {
      continue;
    }
    const podPos = layout.get(n.id);
    if (!podPos) {
      continue;
    }
    const group = groupKey(n);
    const center = centerByNs.get(group) ?? ORIGIN;
    const positions = orbit(
      podPos,
      n.containers.map((c) => c.name),
      { minRadius: 2.5, minGap: 1.5 },
    );
    for (const [, pos] of positions) {
      instances.push({ position: pos, center, color: namespaceColor(group) });
    }
  }
  return buildSpheres(instances, 0.6);
}

function glowTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0.0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.08, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.32)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.12)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.035)");
  gradient.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

// Far tier: one nebula sprite per group, sized to enclose its nodes.
export function buildNamespaceAmas(clusters: NamespaceCluster[]): Group {
  const group = new Group();
  const texture = glowTexture(); // shared by all nebulae
  for (const c of clusters) {
    const material = new SpriteMaterial({
      map: texture,
      color: namespaceColor(c.namespace),
      transparent: true,
      opacity: 0.12,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.name = c.namespace; // lets us hide a filtered group's nebula
    sprite.position.set(c.center.x, c.center.y, c.center.z);
    const diameter = c.radius * 2.4; // the glow spills a bit past the bounding radius
    sprite.scale.set(diameter, diameter, 1);
    group.add(sprite);
  }
  return group;
}
