/**
 * Distance formatting — always in kilometers, never miles.
 */

export function formatKilometers(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(km)}km`;
}

export function metersToKm(meters: number): number {
  return meters / 1000;
}
