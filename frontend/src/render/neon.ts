import { Color } from "three";

// FNV-1a + avalanche so neighboring names (team-0…team-5) get spread hues,
// not near-identical ones.
export function namespaceColor(ns: string): Color {
  let h = 2166136261;
  for (let i = 0; i < ns.length; i++) {
    h ^= ns.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h ^ (h >>> 13)) >>> 0;
  return new Color().setHSL((h % 360) / 360, 0.8, 0.6);
}
