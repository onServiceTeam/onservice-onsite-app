// Lightweight offline "geocoder" for the customer Address Picker.
//
// There is no real geocoding / address-autocomplete provider wired into the app
// yet (the Google Maps keys only render native map tiles). Until one is chosen,
// the address search box matches the typed text against this known-city list and
// the map-tap handler snaps a dropped pin to the nearest known city. Choosing a
// real provider (Google Places, Nominatim, etc.) is a separate product decision
// — see .ai-coder/decisions/D24-address-autocomplete-provider.md.

export interface PhRegion {
  lat: number;
  lng: number;
  city: string;
  province: string;
}

export interface ConfiguredAreaLocation {
  id: string;
  name: string;
  city: string;
  province: string;
  centerLat: number;
  centerLng: number;
}

function normalizePlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const PH_REGIONS: PhRegion[] = [
  // Phase 200 — Metro Cebu launch market, listed first.
  { lat: 10.3157, lng: 123.8854, city: 'Cebu City', province: 'Cebu' },
  { lat: 10.3236, lng: 123.9223, city: 'Mandaue', province: 'Cebu' },
  { lat: 10.3103, lng: 123.9494, city: 'Lapu-Lapu', province: 'Cebu' },
  { lat: 10.2447, lng: 123.8494, city: 'Talisay', province: 'Cebu' },
  { lat: 14.5995, lng: 120.9842, city: 'Manila', province: 'Metro Manila' },
  { lat: 14.6507, lng: 121.0495, city: 'Quezon City', province: 'Metro Manila' },
  { lat: 14.5547, lng: 121.0244, city: 'Makati', province: 'Metro Manila' },
  { lat: 14.5764, lng: 121.0851, city: 'Pasig', province: 'Metro Manila' },
  { lat: 14.5176, lng: 121.0509, city: 'Taguig', province: 'Metro Manila' },
  { lat: 14.4793, lng: 121.0198, city: 'Parañaque', province: 'Metro Manila' },
  { lat: 14.6570, lng: 120.9790, city: 'Caloocan', province: 'Metro Manila' },
  { lat: 14.6042, lng: 120.9822, city: 'San Juan', province: 'Metro Manila' },
  { lat: 14.5378, lng: 121.0014, city: 'Pasay', province: 'Metro Manila' },
  { lat: 14.5832, lng: 120.9783, city: 'Mandaluyong', province: 'Metro Manila' },
  { lat: 14.6588, lng: 121.1107, city: 'Marikina', province: 'Metro Manila' },
  { lat: 14.4445, lng: 120.9940, city: 'Las Piñas', province: 'Metro Manila' },
  { lat: 14.4163, lng: 121.0437, city: 'Muntinlupa', province: 'Metro Manila' },
  { lat: 7.0732, lng: 125.6126, city: 'Davao City', province: 'Davao del Sur' },
  { lat: 8.4542, lng: 124.6319, city: 'Cagayan de Oro', province: 'Misamis Oriental' },
  { lat: 10.6918, lng: 122.5623, city: 'Iloilo City', province: 'Iloilo' },
  { lat: 16.4023, lng: 120.5960, city: 'Baguio', province: 'Benguet' },
  { lat: 14.8149, lng: 120.9640, city: 'Malolos', province: 'Bulacan' },
  { lat: 14.2139, lng: 121.1652, city: 'Calamba', province: 'Laguna' },
  { lat: 15.4857, lng: 120.9715, city: 'Angeles', province: 'Pampanga' },
  { lat: 14.3494, lng: 120.9553, city: 'Bacoor', province: 'Cavite' },
  // Phase 200 — Boracay-area points (Malay, Aklan) so a map tap on the island
  // resolves to a real Boracay-area address instead of a far-away city. Left as
  // historical data; the platform is city-agnostic and Cebu is the default market.
  { lat: 11.9674, lng: 121.9248, city: 'Boracay', province: 'Aklan' },
  { lat: 11.9543, lng: 121.9270, city: 'Boracay', province: 'Aklan' },
  { lat: 11.9805, lng: 121.9180, city: 'Boracay', province: 'Aklan' },
  { lat: 11.9116, lng: 121.9248, city: 'Malay', province: 'Aklan' },
  { lat: 11.9305, lng: 121.9544, city: 'Caticlan', province: 'Aklan' },
  { lat: 11.7086, lng: 122.3618, city: 'Kalibo', province: 'Aklan' },
];

/**
 * Resolve the city/province for a map pin by nearest known region. Returns empty
 * strings when the nearest known city is more than ~0.5 degrees away (so a pin
 * dropped far from any configured city is treated as "unknown" rather than
 * snapping to a wrong city).
 */
export function guessRegionFromCoordinates(lat: number, lng: number): { city: string; province: string } {
  let closest = PH_REGIONS[0]!;
  let minDist = Infinity;
  for (const r of PH_REGIONS) {
    const d = Math.sqrt((r.lat - lat) ** 2 + (r.lng - lng) ** 2);
    if (d < minDist) { minDist = d; closest = r; }
  }
  if (minDist > 0.5) return { city: '', province: '' };
  return { city: closest.city, province: closest.province };
}

/**
 * Find the region for a typed address by checking whether the typed text
 * CONTAINS a known city or province name.
 *
 * Bug (reported by a Cebu City tester, 2026-06-16): the previous check had the
 * `.includes` arguments reversed — it asked whether the short city name
 * ("cebu city") contained the whole typed address
 * ("flordeliz street bulacao, cebu city, philippines 6000"), which is always
 * false for any real street-level address. So every realistic search fell
 * through to an empty-city result, and the Confirm step then blocked with
 * "Location Not Recognized — We could not determine the city for this pin."
 * Checking the other way (does the typed text contain a known city/province
 * name) resolves the city for normal addresses. Returns null when no known city
 * name appears, so the caller can show a helpful message instead of fabricating
 * an empty-city result.
 */
export function matchRegionForQuery(searchText: string): PhRegion | null {
  const query = normalizePlace(searchText);
  if (!query) return null;
  // UX-050 — city must win over province. Metro Cebu cities all share the
  // province "Cebu"; the old single-pass OR returned Cebu City before it ever
  // reached Mandaue, Lapu-Lapu, or Talisay.
  const cityMatch = PH_REGIONS.find((r) => query.includes(normalizePlace(r.city)));
  if (cityMatch) return cityMatch;
  return PH_REGIONS.find((r) => query.includes(normalizePlace(r.province))) ?? null;
}

/**
 * Match only the service areas currently returned by the API. City matches
 * are authoritative; a province-only query can legitimately return several
 * choices (for example all four Metro Cebu launch cities).
 */
export function matchConfiguredAreasForQuery<T extends ConfiguredAreaLocation>(
  searchText: string,
  areas: T[],
): T[] {
  const query = normalizePlace(searchText);
  if (!query) return [];

  const cityMatches = areas.filter((area) => {
    const city = normalizePlace(area.city);
    const name = normalizePlace(area.name);
    return (city.length > 0 && query.includes(city)) || (name.length > 0 && query.includes(name));
  });
  if (cityMatches.length > 0) return cityMatches;

  return areas.filter((area) => {
    const province = normalizePlace(area.province);
    return province.length > 0 && query.includes(province);
  });
}

export function findNearestConfiguredArea<T extends ConfiguredAreaLocation>(
  latitude: number,
  longitude: number,
  areas: T[],
): T | null {
  let nearest: T | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const area of areas) {
    const candidate = Math.sqrt(
      (area.centerLat - latitude) ** 2 + (area.centerLng - longitude) ** 2,
    );
    if (candidate < distance) {
      nearest = area;
      distance = candidate;
    }
  }
  return nearest;
}
