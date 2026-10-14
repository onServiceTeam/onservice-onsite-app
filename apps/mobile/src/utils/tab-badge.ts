/** A tab-bar badge value: nothing at 0, the number up to 9, then "9+". */
export function tabBadge(count: number): string | number | undefined {
  if (!Number.isFinite(count) || count <= 0) return undefined;
  return count > 9 ? '9+' : Math.floor(count);
}
