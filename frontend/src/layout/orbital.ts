import type { Vec3 } from "./types";

export interface OrbitOptions {
  minRadius: number; // floor radius, even with few children
  minGap: number; // target minimum arc gap between siblings
  phase?: number; // angular offset, to avoid radial alignments
}

// Places children evenly around a circle in the XZ plane; radius grows with
// count to keep the minimum gap.
export function orbit(
  center: Vec3,
  childIds: string[],
  opts: OrbitOptions,
): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  const n = childIds.length;
  if (n === 0) {
    return out;
  }
  const radius = Math.max(opts.minRadius, (n * opts.minGap) / (2 * Math.PI));
  const phase = opts.phase ?? 0;
  childIds.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2 + phase;
    out.set(id, {
      x: center.x + radius * Math.cos(angle),
      y: center.y,
      z: center.z + radius * Math.sin(angle),
    });
  });
  return out;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Phyllotactic spiral: radius grows as sqrt(i), so N items fit a radius ∝ sqrt(N)
// instead of ∝ N for a plain ring.
export function sunflower(
  center: Vec3,
  ids: string[],
  spacing: number,
): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  ids.forEach((id, i) => {
    const radius = spacing * Math.sqrt(i);
    const angle = i * GOLDEN_ANGLE;
    out.set(id, {
      x: center.x + radius * Math.cos(angle),
      y: center.y,
      z: center.z + radius * Math.sin(angle),
    });
  });
  return out;
}
