// Deterministic order: same input -> same positions, regardless of arrival order.
export function sortedIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
