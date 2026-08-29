export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Layout = Map<string, Vec3>; // node id -> position

// Fallback for a missing position or group center.
export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

// Append to a list held in a map, creating it on first use.
export function mapPush(map: Map<string, string[]>, key: string, value: string): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}
