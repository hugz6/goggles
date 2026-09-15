import { Vector3, Group, Mesh } from "three";
import type { InstancedMesh, MeshBasicMaterial, Sprite, SpriteMaterial, Material } from "three";
import { createStage } from "./render/scene";
import { buildNodes, buildNamespaceAmas, buildContainers } from "./render/nodes";
import { buildSelectionMarker } from "./render/marker";
import { buildStarfield } from "./render/starfield";
import { LabelLayer } from "./render/labels";
import { HealthAura } from "./render/health";
import { StorageRing } from "./render/storage";
import { EdgeLayer } from "./render/edges";
import type { NetEdge } from "./render/edges";
import { computeLayout } from "./layout/containment";
import { namespaceClusters } from "./layout/clusters";
import { groupOfFactory } from "./layout/grouping";
import type { GroupMode } from "./layout/grouping";
import { orbit } from "./layout/orbital";
import { tierForDistance, amasOpacity } from "./render/lod";
import { fetchGraph } from "./api/client";
import type { Graph } from "./api/client";
import { ORIGIN } from "./layout/types";
import type { Vec3 } from "./layout/types";
import { buildNavModel } from "./nav/model";
import { Navigation } from "./nav/navigation";
import type { NavLevel, Selection } from "./nav/navigation";
import { Panel } from "./ui/panel";
import { Controls, emptyFilter, makeHidden } from "./ui/controls";
import type { FilterState, SearchItem } from "./ui/controls";
import { DetailView } from "./ui/detail";
import type { DetailAction } from "./ui/detail";
import { HelpView } from "./ui/help";
import { LogsPopup, EventsPopup } from "./ui/livePopup";
import { fetchMeta } from "./api/live";
import { ContextPicker } from "./ui/contextPicker";
import type { DetailData, DetailSection } from "./ui/detail";
import { Hud } from "./ui/hud";

const FAST_MS = 5000; // near the selection
const SLOW_MS = 60000; // whole cluster

interface SavedState {
  edgesEnabled: boolean;
  ownEnabled: boolean;
  selection: { namespace: string; entityId?: string } | null;
  filter: FilterState;
  navSpread: number; // current spread, kept to avoid a jump on rebuild
}

// Rebuilt on every model change; the global objects (camera, marker) survive.
interface Scene {
  root: Group;
  tick(): void;
  onKey(e: KeyboardEvent): void;
  onPointerDown(e: PointerEvent): void;
  onPointerUp(e: PointerEvent): void;
  save(): SavedState;
  dispose(): void;
  focusNamespace(): string | null; // null when not navigating
  updateAttributes(graph: Graph): void; // in place, no rebuild flicker
  describe(): DetailData | null;
}

// Topology (ids/kinds/edges) triggers a rebuild; attributes (health/CPU) update
// in place, without flicker.
function topoSig(g: Graph, filterNs?: string): string {
  const inScope = (n: Graph["nodes"][number]) => !filterNs || (n.namespace ?? "") === filterNs;
  const ids = new Set(g.nodes.filter(inScope).map((n) => n.id));
  const nodes = g.nodes.filter(inScope).map((n) => `${n.id}|${n.kind}`).sort().join(";");
  const edges = g.edges
    .filter((e) => !filterNs || ids.has(e.from) || ids.has(e.to))
    .map((e) => `${e.from}>${e.to}|${e.kind}`)
    .sort()
    .join(";");
  return `${filterNs ?? ""}#${nodes}#${edges}`;
}

function attrSig(g: Graph, filterNs?: string): string {
  return g.nodes
    .filter((n) => !filterNs || (n.namespace ?? "") === filterNs)
    .map((n) => `${n.id}|${n.health ?? ""}|${Math.round((n.cpuMillis ?? 0) / 50)}`) // quantized: ignore noise
    .sort()
    .join(";");
}

// textures are shared/cached, not freed here
function disposeGroup(root: Group): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

const FADE_SPEED = 0.12;

const LEVEL_DISTANCE: Record<NavLevel, number> = {
  namespace: 700,
  entity: 220,
  container: 90,
};
const MARKER_SCALE: Record<NavLevel, number> = {
  namespace: 120,
  entity: 8,
  container: 3,
};
const FOCUS_RADIUS: Record<NavLevel, number> = {
  namespace: 0,
  entity: 45,
  container: 45,
};

// Fit-to-screen framing of the group local to the selection.
const LOCAL_GROUP_RADIUS = 30; // base radius of entities considered "local group"
const FIT_MIN_RADIUS: Record<NavLevel, number> = {
  namespace: 0,
  entity: 10, // lower bound: avoids over-zooming on an isolated entity
  container: 4,
};
const FIT_MARGIN = 1.2; // margin around the enclosing group
const FIT_ZOOM = 0.85; // < 1: slightly more zoomed than the exact fit
const ZOOM_MIN = 0.6; // wheel-zoom bounds around the selected level
const ZOOM_MAX = 1.7;

const SPREAD_MIN = 0.35; // contracted galaxy at rest
const NAV_SPREAD = 2.5;

const LABEL_Y_OFFSET = 5; // label above the entity (clear of the glow)
const LABEL_FADE_RADIUS = 80; // base radius over which labels fade near the selection
const EDGE_RADIUS = 40; // base radius of the local edge mesh around the selection

function fadeTo(mesh: InstancedMesh, target: number): void {
  const material = mesh.material as MeshBasicMaterial;
  material.opacity += (target - material.opacity) * FADE_SPEED;
  mesh.visible = material.opacity > 0.02;
}

function spreadPoint(base: Vec3, center: Vec3, s: number): Vec3 {
  return {
    x: center.x + (base.x - center.x) * s,
    y: center.y + (base.y - center.y) * s,
    z: center.z + (base.z - center.z) * s,
  };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const canvas = document.getElementById("app") as HTMLCanvasElement;
const stage = createStage(canvas);
const detail = new DetailView();
const panel = new Panel(() => {
  const d = scene?.describe();
  if (d) {
    detail.show(d);
  }
});
new Hud();
const help = new HelpView();
const logsPopup = new LogsPopup();
const eventsPopup = new EventsPopup();
let liveAvailable = false; // gates the describe buttons
fetchMeta().then((meta) => {
  liveAvailable = meta.live;
  if (meta.needsContext) {
    new ContextPicker().show();
  }
});
const starfield = buildStarfield();
stage.scene.add(starfield);
stage.addFrameListener(() => {
  starfield.rotation.y += 0.00006;
});
// Selection marker: global, survives scene rebuilds.
const marker = buildSelectionMarker();
stage.scene.add(marker);

function createScene(graph: Graph, saved: SavedState | null): Scene {
  const root = new Group();
  const groupOf = groupOfFactory(groupMode);
  const layout = computeLayout(graph, groupMode);
  const clusters = namespaceClusters(graph, layout, groupOf);
  const centerByNs = new Map(clusters.map((c) => [c.namespace, c.center]));
  const amas = buildNamespaceAmas(clusters);
  const nodes = buildNodes(graph, layout, centerByNs, groupOf);
  const containers = buildContainers(graph, layout, centerByNs, groupOf);
  const labels = new LabelLayer();
  let health = new HealthAura(graph, layout, centerByNs, groupOf);

  const edgeInfo = new Map(
    graph.nodes.flatMap((n) => {
      const base = layout.get(n.id);
      return base
        ? [[n.id, { base, center: centerByNs.get(groupOf(n)) ?? ORIGIN }] as const]
        : [];
    }),
  );
  const netEdges: NetEdge[] = graph.edges.filter(
    (e) => e.kind === "serves" || e.kind === "allowed" || e.kind === "mounts",
  );
  const edgeLayer = new EdgeLayer(netEdges, edgeInfo);

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const podsWithStorage = new Set(
    graph.edges.filter((e) => e.kind === "mounts").map((e) => e.from),
  );
  const storage = new StorageRing(
    podsWithStorage,
    layout,
    centerByNs,
    (id) => {
      const n = nodeById.get(id);
      return n ? groupOf(n) : "";
    },
  );

  const ownEdges: NetEdge[] = graph.edges.filter((e) => e.kind === "owns");
  const ownLayer = new EdgeLayer(ownEdges, edgeInfo);

  root.add(
    amas,
    nodes.group,
    containers.mesh,
    health.group,
    storage.group,
    edgeLayer.object,
    ownLayer.object,
  );
  stage.overlay.add(labels.group); // after bloom, so labels stay crisp

  const model = buildNavModel(graph, (id) => layout.has(id), groupOf);
  const nav = new Navigation(model);

  let navGoal: { target: Vector3; camPos: Vector3 } | null = null;
  let focus: { base: Vec3; center: Vec3; level: NavLevel } | null = null;
  let focusCenter: Vec3 | null = null; // focused group center (spread reference)
  let focusDistance = 0; // target camera distance of the current level (zoom bounds)
  let labelNs: string | null = null; // group whose labels are laid out
  let navSpread = saved?.navSpread ?? SPREAD_MIN; // current (smoothed) spread, kept on rebuild
  let edgesEnabled = true; // network edges display (E toggle)
  let ownEnabled = false; // ownership edges display (O toggle)

  const filter: FilterState = saved?.filter ?? emptyFilter();

  let hiddenPred = makeHidden(filter, groupOf);
  const hiddenById = (id: string): boolean => {
    const n = nodeById.get(id);
    return !n || hiddenPred(n);
  };
  // Groups with ≥1 visible node keep their nebula; a fully collapsed/filtered
  // group vanishes entirely instead of lingering as an amas.
  let nebulaNs = new Set<string>();
  function recomputeNebula(): void {
    const shown = new Set<string>();
    for (const n of graph.nodes) {
      if (!hiddenById(n.id)) {
        shown.add(groupOf(n));
      }
    }
    nebulaNs = shown;
  }

  function firstVisibleGroup(): string | undefined {
    return model.groups.find((ns) => nebulaNs.has(ns));
  }

  // Selection must never stay on a hidden object or a group gone invisible.
  // Switches to a visible sibling, then a visible group. Returns true if changed.
  function ensureVisibleSelection(): boolean {
    const cur = nav.current();

    if (cur.level === "namespace") {
      if (nebulaNs.has(cur.namespace)) {
        return false;
      }
      const g = firstVisibleGroup();
      if (g && g !== cur.namespace) {
        nav.selectNamespace(g);
        return true;
      }
      return false;
    }

    if (!cur.entityId || !hiddenById(cur.entityId)) {
      return false;
    }
    if (cur.level === "entity") {
      const ids = nav.siblingIds();
      const vis = ids.findIndex((id) => !hiddenById(id));
      if (vis >= 0) {
        nav.setIndex(vis);
        return true;
      }
    }
    const g = firstVisibleGroup();
    if (g) {
      nav.selectNamespace(g);
      return true;
    }
    while (nav.current().level !== "namespace") {
      nav.back();
    }
    return true;
  }

  function applyFilter(): void {
    hiddenPred = makeHidden(filter, groupOf);
    nodes.setHidden(hiddenById);
    health.setHidden(hiddenById);
    storage.setHidden(hiddenById);
    recomputeNebula();
    if (ensureVisibleSelection()) {
      applySelection(true);
      return;
    }
    // refresh edges only; labels follow worldPositions per frame
    if (focus && focus.level !== "namespace") {
      const selId = nav.current().entityId ?? "";
      updateEdgeLayer(edgeLayer, edgesEnabled, selId, focus.base);
      updateEdgeLayer(ownLayer, ownEnabled, selId, focus.base);
    }
  }
  applyFilter();

  const searchIndex: SearchItem[] = graph.nodes
    .filter((n) => layout.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      namespace: n.namespace ?? "",
      health: n.health,
      nodeName: n.nodeName,
      labels: n.labels,
      cpuMillis: n.cpuMillis,
      memBytes: n.memBytes,
      cpuLimitMillis: n.cpuLimitMillis,
      memLimitBytes: n.memLimitBytes,
    }));
  const groupList = clusters.map((c) => c.namespace).filter((g) => g).sort();

  const controls = new Controls({
    groups: groupList,
    groupMode,
    search: searchIndex,
    filter,
    onChange: applyFilter,
    onPick: (id) => {
      const node = nodeById.get(id);
      if (node && nav.selectEntity(groupOf(node), node.id)) {
        applySelection(true); // recenter on the result
      }
    },
    onGroupMode: setGroupMode,
  });

  // must match the orbit settings used in the container rendering
  function containerBase(podId: string, name: string): Vec3 | undefined {
    const pod = model.nodeById.get(podId);
    const podPos = layout.get(podId);
    if (!pod?.containers || !podPos) {
      return undefined;
    }
    return orbit(
      podPos,
      pod.containers.map((c) => c.name),
      { minRadius: 2.5, minGap: 1.5 },
    ).get(name);
  }

  function baseOf(sel: Selection): Vec3 {
    const center = centerByNs.get(sel.namespace) ?? ORIGIN;
    if (sel.level === "entity" && sel.entityId) {
      return layout.get(sel.entityId) ?? center;
    }
    if (sel.level === "container" && sel.entityId && sel.containerName) {
      return containerBase(sel.entityId, sel.containerName) ?? layout.get(sel.entityId) ?? center;
    }
    return center;
  }

  function localGroupBases(sel: Selection): Vec3[] {
    if (sel.level === "container" && sel.entityId) {
      const pod = model.nodeById.get(sel.entityId);
      return (pod?.containers ?? [])
        .map((c) => containerBase(sel.entityId!, c.name))
        .filter((p): p is Vec3 => p !== undefined);
    }
    const out: Vec3[] = [];
    const self = baseOf(sel);
    for (const id of model.entitiesByGroup.get(sel.namespace) ?? []) {
      const p = layout.get(id);
      if (p && dist(p, self) <= LOCAL_GROUP_RADIUS) {
        out.push(p);
      }
    }
    return out;
  }

  // Camera distance to fit the local group on screen, bounded by the tighter
  // half-angle (vertical or horizontal per aspect).
  function fitDistance(sel: Selection): number {
    if (sel.level === "namespace") {
      return LEVEL_DISTANCE.namespace;
    }
    const center = centerByNs.get(sel.namespace) ?? ORIGIN;
    const selPos = spreadPoint(baseOf(sel), center, NAV_SPREAD);
    let radius = FIT_MIN_RADIUS[sel.level];
    for (const b of localGroupBases(sel)) {
      radius = Math.max(radius, dist(spreadPoint(b, center, NAV_SPREAD), selPos));
    }
    radius *= FIT_MARGIN;

    const halfV = (stage.camera.fov * Math.PI) / 180 / 2;
    const halfH = Math.atan(Math.tan(halfV) * stage.camera.aspect);
    const half = Math.min(halfV, halfH);
    return (radius / Math.tan(half)) * FIT_ZOOM;
  }

  function ensureLabels(namespace: string): void {
    if (labelNs === namespace) {
      return;
    }
    labelNs = namespace;
    const ids = model.entitiesByGroup.get(namespace) ?? [];
    labels.reset(
      ids.flatMap((id) => {
        const node = model.nodeById.get(id);
        const base = layout.get(id);
        return node && base ? [{ id, kind: node.kind, base }] : [];
      }),
    );
  }

  function updateEdgeLayer(
    layer: EdgeLayer,
    enabled: boolean,
    selId: string,
    base: Vec3,
  ): void {
    if (enabled) {
      layer.setActive(selId, base, EDGE_RADIUS, hiddenById);
      layer.setVisible(true);
    } else {
      layer.setVisible(false);
      layer.clear();
    }
  }

  // moveCamera: true on arrows (camera follows), false on click (select only).
  function applySelection(moveCamera: boolean): void {
    const sel = nav.current();
    panel.update(model, sel);

    const center = centerByNs.get(sel.namespace) ?? ORIGIN;
    focusCenter = sel.level === "namespace" ? null : center;
    const base = baseOf(sel);
    focus = { base, center, level: sel.level };

    nodes.spotlight(sel.level === "namespace" ? null : base, FOCUS_RADIUS[sel.level]);

    if (sel.level === "namespace") {
      labels.setVisible(false);
      edgeLayer.setVisible(false);
      edgeLayer.clear();
      ownLayer.setVisible(false);
      ownLayer.clear();
    } else {
      ensureLabels(sel.namespace);
      labels.setVisible(true);
      labels.setFocus(base, LABEL_FADE_RADIUS);
      updateEdgeLayer(edgeLayer, edgesEnabled, sel.entityId ?? "", base);
      updateEdgeLayer(ownLayer, ownEnabled, sel.entityId ?? "", base);
    }

    focusDistance = fitDistance(sel); // zoom-bounds reference, even without moving

    if (!moveCamera) {
      return;
    }
    // Target computed at the FINAL spread (NAV_SPREAD) despite navSpread smoothing.
    const point = spreadPoint(base, center, sel.level === "namespace" ? SPREAD_MIN : NAV_SPREAD);
    const target = new Vector3(point.x, point.y, point.z);
    const dir = new Vector3().subVectors(stage.camera.position, stage.controls.target);
    if (dir.lengthSq() < 1e-6) {
      dir.set(0, 0.5, 1);
    }
    dir.normalize();
    navGoal = { target, camPos: target.clone().add(dir.multiplyScalar(focusDistance)) };
  }

  function renderSpread(center: Vec3): number {
    return focusCenter && center === focusCenter ? navSpread : SPREAD_MIN;
  }

  function siblingWorldPos(sel: Selection, id: string): Vec3 {
    if (sel.level === "namespace") {
      return centerByNs.get(id) ?? ORIGIN;
    }
    const center = centerByNs.get(sel.namespace) ?? ORIGIN;
    const s = renderSpread(center);
    const base =
      sel.level === "entity"
        ? layout.get(id)
        : sel.entityId
          ? containerBase(sel.entityId, id)
          : undefined;
    return spreadPoint(base ?? center, center, s);
  }

  // -1 if none. skipHidden is false at namespace/container levels (not nodes).
  function nextVisibleSibling(ids: string[], from: number, step: number, skipHidden: boolean): number {
    const n = ids.length;
    for (let k = 1; k < n; k++) {
      const i = (((from + step * k) % n) + n) % n;
      if (!skipHidden || !hiddenById(ids[i])) {
        return i;
      }
    }
    return -1;
  }

  // Picks the neighbor in the requested direction, in the camera basis
  // (right/up) rather than a perspective projection - robust even when
  // siblings pass behind the camera at max zoom.
  function spatialMove(dir: { x: number; y: number }, linear: number): void {
    const sel = nav.current();
    const ids = nav.siblingIds();
    if (ids.length <= 1) {
      return;
    }
    const skipHidden = sel.level === "entity";
    stage.camera.updateMatrixWorld();
    const camRight = new Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
    const camUp = new Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 1);

    const positions = ids.map((id) => {
      const p = siblingWorldPos(sel, id);
      return new Vector3(p.x, p.y, p.z);
    });
    const current = positions[nav.currentIndex()];

    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < positions.length; i++) {
      if (i === nav.currentIndex()) {
        continue;
      }
      if (skipHidden && hiddenById(ids[i])) {
        continue; // hidden object (collapse/filter): not selectable
      }
      const delta = positions[i].clone().sub(current);
      const sx = delta.dot(camRight);
      const sy = delta.dot(camUp);
      const along = sx * dir.x + sy * dir.y;
      if (along <= 1e-4) {
        continue; // not in this direction
      }
      const perp = Math.abs(sx * dir.y - sy * dir.x);
      const outOfCone = perp > along * 1.6 ? 1e6 : 0; // penalize outside ~58°
      const score = along + perp * 2 + outOfCone;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    let target = best;
    if (target < 0) {
      target = nextVisibleSibling(ids, nav.currentIndex(), linear, skipHidden);
    }
    if (target < 0) {
      return;
    }
    nav.setIndex(target);
    applySelection(true);
  }

  const PICK_TOLERANCE_PX = 24; // nearest node within this many px, not a raycast
  const pickPos = new Vector3();
  let downAt: { x: number; y: number } | null = null;

  function pickAt(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    let best: string | null = null;
    let bestPx = PICK_TOLERANCE_PX;
    for (const [id, p] of nodes.worldPositions) {
      pickPos.set(p.x, p.y, p.z).project(stage.camera);
      if (pickPos.z > 1) {
        continue; // behind the camera
      }
      const sx = rect.left + ((pickPos.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - pickPos.y) / 2) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestPx) {
        bestPx = d;
        best = id;
      }
    }
    return best;
  }

  function onPointerDown(e: PointerEvent): void {
    downAt = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: PointerEvent): void {
    if (!downAt) {
      return;
    }
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 5) {
      return; // it was a rotation, not a click
    }
    const id = pickAt(e.clientX, e.clientY);
    const node = id ? nodeById.get(id) : undefined;
    if (!node || !nav.selectEntity(groupOf(node), node.id)) {
      return;
    }
    applySelection(true); // recenter and adjust zoom on the clicked entity
  }

  function onKey(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    switch (e.key) {
      case "ArrowLeft":
        spatialMove({ x: -1, y: 0 }, -1);
        break;
      case "ArrowRight":
        spatialMove({ x: 1, y: 0 }, 1);
        break;
      case "ArrowUp":
        spatialMove({ x: 0, y: 1 }, -1);
        break;
      case "ArrowDown":
        spatialMove({ x: 0, y: -1 }, 1);
        break;
      case "Escape":
        nav.back(); // go up one level
        applySelection(true);
        break;
      default:
        if (key === "q") {
          nav.enter();
          ensureVisibleSelection(); // don't dive onto a hidden object (collapsed group)
          applySelection(true);
        } else if (key === "w") {
          nav.back();
          applySelection(true);
        } else if (key === "e") {
          edgesEnabled = !edgesEnabled; // toggle network edges
          applySelection(false);
        } else if (key === "o") {
          ownEnabled = !ownEnabled; // toggle ownership edges
          applySelection(false);
        } else {
          return;
        }
    }
    e.preventDefault();
  }

  function tick(): void {
    const cam = stage.camera.position;
    const distTo = (p: Vec3): number =>
      Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z);

    const navTarget = focusCenter ? NAV_SPREAD : SPREAD_MIN;
    navSpread += (navTarget - navSpread) * 0.12;

    nodes.setSpread(renderSpread);
    containers.setSpread(renderSpread);
    health.update(renderSpread, performance.now() / 1000);
    storage.update(renderSpread);
    if (edgeLayer.object.visible) {
      edgeLayer.update(renderSpread);
    }
    if (ownLayer.object.visible) {
      ownLayer.update(renderSpread);
    }

    const deepFocus = focus !== null && focus.level !== "namespace";
    let nearestCenter = Infinity;
    for (const child of amas.children) {
      const sprite = child as Sprite;
      if (!nebulaNs.has(sprite.name)) {
        sprite.visible = false;
        continue;
      }
      const d = distTo(sprite.position);
      nearestCenter = Math.min(nearestCenter, d);
      const material = sprite.material as SpriteMaterial;
      const target = deepFocus ? 0 : amasOpacity(d);
      material.opacity += (target - material.opacity) * 0.1; // soft fade
      sprite.visible = material.opacity > 0.01;
    }
    const showContainers = focus
      ? focus.level === "container"
      : tierForDistance(nearestCenter) === "container";
    fadeTo(containers.mesh, showContainers ? 1 : 0);

    if (labels.group.visible && focusCenter) {
      const s = renderSpread(focusCenter);
      const c = focusCenter;
      labels.setPositions((base) => spreadPoint(base, c, s), LABEL_Y_OFFSET);
      labels.declutter(stage.camera, window.innerWidth, window.innerHeight, nodes.worldPositions);
    }

    if (navGoal) {
      stage.controls.target.lerp(navGoal.target, 0.12);
      cam.lerp(navGoal.camPos, 0.12);
      if (cam.distanceTo(navGoal.camPos) < 1) {
        navGoal = null;
      }
      stage.controls.minDistance = 0.01; // no bounds during animation, or the lerp fights OrbitControls
      stage.controls.maxDistance = Infinity;
    } else if (focusDistance > 0) {
      stage.controls.minDistance = focusDistance * ZOOM_MIN;
      stage.controls.maxDistance = focusDistance * ZOOM_MAX;
    }

    if (focus) {
      const p = spreadPoint(focus.base, focus.center, renderSpread(focus.center));
      marker.position.set(p.x, p.y, p.z);
      const scale = MARKER_SCALE[focus.level];
      marker.scale.set(scale, scale, 1);
    }
  }

  function save(): SavedState {
    const sel = nav.current();
    return {
      edgesEnabled,
      ownEnabled,
      selection: sel ? { namespace: sel.namespace, entityId: sel.entityId } : null,
      filter,
      navSpread,
    };
  }

  function dispose(): void {
    controls.dispose();
    stage.overlay.remove(labels.group); // overlay is global
    disposeGroup(labels.group);
    disposeGroup(root);
  }

  function focusNamespace(): string | null {
    return nav.current().namespace;
  }

  function describe(): DetailData | null {
    const sel = nav.current();
    const node = model.nodeById.get(sel.entityId ?? "");
    if (!node) {
      const ids = model.entitiesByGroup.get(sel.namespace) ?? [];
      const byKind = new Map<string, number>();
      for (const id of ids) {
        const n = model.nodeById.get(id);
        if (n) {
          byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
        }
      }
      return {
        kind: "namespace",
        title: sel.namespace || "-",
        sections: [
          { title: "overview", rows: [["entities", String(ids.length)]] },
          {
            title: "by kind",
            rows: [...byKind].sort().map(([k, c]) => [k, String(c)] as [string, string]),
            accentKey: true,
          },
        ],
      };
    }

    // fallback: minimal metadata for an older snapshot without detail
    const sections: DetailSection[] = node.detail?.length
      ? node.detail.map((s) => ({ title: s.title, rows: s.rows, accentKey: s.accentKey }))
      : [
          {
            title: "metadata",
            rows: [
              ["name", node.name],
              ["kind", node.kind],
              ["namespace", node.namespace ?? "-"],
              ["uid", node.id],
            ],
          },
        ];

    const rel: [string, string][] = [];
    for (const e of graph.edges) {
      if (e.from === node.id) {
        const o = model.nodeById.get(e.to);
        rel.push([`-> ${e.kind}`, `${o?.kind ?? ""} ${o?.name ?? e.to}`.trim()]);
      } else if (e.to === node.id) {
        const o = model.nodeById.get(e.from);
        rel.push([`<- ${e.kind}`, `${o?.kind ?? ""} ${o?.name ?? e.from}`.trim()]);
      }
    }
    sections.push({ title: "relations", rows: rel, accentKey: true });

    // Live buttons (cluster mode): events for any entity, logs for pods.
    const actions: DetailAction[] = [];
    if (liveAvailable) {
      if (node.kind === "Pod") {
        const ns = node.namespace ?? "";
        const containers = (node.containers ?? []).map((c) => c.name);
        actions.push({
          label: "◱ logs",
          onClick: () => logsPopup.open({ namespace: ns, pod: node.name, containers }),
        });
      }
      actions.push({
        label: "◲ events",
        onClick: () =>
          eventsPopup.open({ namespace: node.namespace ?? "", uid: node.id, title: node.name }),
      });
    }

    return { kind: node.kind, title: node.name, sections, actions };
  }

  function updateAttributes(g: Graph): void {
    for (const n of g.nodes) {
      const old = nodeById.get(n.id);
      if (old) {
        old.health = n.health;
        old.cpuMillis = n.cpuMillis;
        old.memBytes = n.memBytes;
        old.cpuLimitMillis = n.cpuLimitMillis;
        old.memLimitBytes = n.memLimitBytes;
        old.detail = n.detail; // keep describe fresh without a rebuild
      }
    }
    root.remove(health.group);
    disposeGroup(health.group);
    health = new HealthAura(g, layout, centerByNs, groupOf);
    health.setHidden(hiddenById);
    root.add(health.group);
    panel.update(model, nav.current());
  }

  marker.visible = true;
  const restored = saved?.selection;
  if (!(restored?.entityId && nav.selectEntity(restored.namespace, restored.entityId))) {
    nav.reset();
  }
  applySelection(false);

  console.log(`g5s: ${graph.nodes.length} nodes, ${clusters.length} nebulae`);

  return {
    root,
    tick,
    onKey,
    onPointerDown,
    onPointerUp,
    save,
    dispose,
    focusNamespace,
    updateAttributes,
    describe,
  };
}

let scene: Scene | null = null;
let groupMode: GroupMode = "namespace"; // changing it triggers a full rebuild
let lastGraph: Graph | null = null; // last model received, to re-group on the fly
function setGroupMode(mode: GroupMode): void {
  if (mode === groupMode || !lastGraph) {
    return;
  }
  groupMode = mode;
  rebuild(lastGraph);
}

let globalTopo = "";
let globalAttr = "";
let localNs: string | null = null;
let localTopo = "";
let localAttr = "";

function rebuild(graph: Graph): void {
  const saved = scene?.save() ?? null;
  if (scene) {
    stage.scene.remove(scene.root);
    scene.dispose();
  }
  scene = createScene(graph, saved);
  stage.scene.add(scene.root);
  resetBaselines(graph);
}

function resetBaselines(graph: Graph): void {
  globalTopo = topoSig(graph);
  globalAttr = attrSig(graph);
  localNs = scene?.focusNamespace() ?? null;
  localTopo = localNs ? topoSig(graph, localNs) : "";
  localAttr = localNs ? attrSig(graph, localNs) : "";
}

function applyChange(graph: Graph, prevTopo: string, prevAttr: string, ns?: string): void {
  if (topoSig(graph, ns) !== prevTopo) {
    rebuild(graph);
  } else if (attrSig(graph, ns) !== prevAttr) {
    scene?.updateAttributes(graph);
    resetBaselines(graph);
  }
}

async function refreshGlobal(): Promise<void> {
  const graph = await fetchGraph();
  lastGraph = graph;
  if (!scene) {
    rebuild(graph);
    return;
  }
  applyChange(graph, globalTopo, globalAttr);
}

async function refreshLocal(): Promise<void> {
  const ns = scene?.focusNamespace() ?? null;
  if (!ns) {
    return;
  }
  const graph = await fetchGraph();
  lastGraph = graph;
  if (ns !== localNs) {
    // namespace changed: reset baseline, don't diff against the old one
    localNs = ns;
    localTopo = topoSig(graph, ns);
    localAttr = attrSig(graph, ns);
    return;
  }
  applyChange(graph, localTopo, localAttr, ns);
}

canvas.addEventListener("pointerdown", (e) => scene?.onPointerDown(e));
canvas.addEventListener("pointerup", (e) => scene?.onPointerUp(e));
window.addEventListener("keydown", (e) => {
  // let inputs type normally, don't hijack nav keys
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
    return;
  }
  if (e.key === "?") {
    e.preventDefault();
    help.toggle();
    return;
  }
  // "/" must not open the browser's quick-find
  if (e.key === "/") {
    const box = document.getElementById("g5s-filter") as HTMLInputElement | null;
    if (box) {
      e.preventDefault();
      box.focus();
      box.select();
      return;
    }
  }
  scene?.onKey(e);
});
stage.addFrameListener(() => scene?.tick());

refreshGlobal().catch((err) => {
  console.error("g5s: failed to load the graph", err);
});
setInterval(() => {
  refreshLocal().catch((err) => console.error("g5s: proximity refresh failed", err));
}, FAST_MS);
setInterval(() => {
  refreshGlobal().catch((err) => console.error("g5s: global refresh failed", err));
}, SLOW_MS);
