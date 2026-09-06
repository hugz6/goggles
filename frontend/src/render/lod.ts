// Level of detail: camera distance picks the displayed tier. Pure, no Three.js.

type Tier = "cluster" | "detail" | "container";

// Tuned to the galaxy layout scale (islands radius ~300, camera starts ~480).
export const TIER_THRESHOLDS = {
  cluster: 900, // beyond: only namespace nebulae dominate
  container: 220, // below: containers reveal
};

export function tierForDistance(distance: number): Tier {
  if (distance >= TIER_THRESHOLDS.cluster) {
    return "cluster";
  }
  if (distance <= TIER_THRESHOLDS.container) {
    return "container";
  }
  return "detail";
}

const AMAS_MAX_OPACITY = 0.62; // fades to 0 on entering the namespace

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// 0 at the cluster tier, 1 at the container tier, smoothed in between.
function nearness(distance: number): number {
  const { cluster, container } = TIER_THRESHOLDS;
  return smoothstep(clamp01((cluster - distance) / (cluster - container)));
}

export function amasOpacity(distance: number): number {
  return AMAS_MAX_OPACITY * (1 - nearness(distance));
}
