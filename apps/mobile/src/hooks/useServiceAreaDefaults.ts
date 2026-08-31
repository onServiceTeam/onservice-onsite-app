import { useQuery } from '@tanstack/react-query';
import { getActiveServiceAreas, type ServiceArea } from '@/services/service-area.service';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Last-resort map center used before the configured service areas load, when
 * the API is unreachable, or when no areas are configured yet. Metro Cebu is
 * the default launch market. The LIVE default comes from the admin-configured
 * service area flagged `is_default` (see useServiceAreaDefaults) — this
 * constant is only the offline floor so the map always has something to show.
 */
export const FALLBACK_REGION: MapRegion = {
  latitude: 10.3157,
  longitude: 123.8854,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/** Map region that frames roughly the whole service radius of an area. */
export function regionForArea(area: ServiceArea): MapRegion {
  // ~111 km per degree of latitude; x2.2 so the radius circle isn't flush to
  // the screen edge. Clamped so tiny/huge radii still give a usable zoom.
  const delta = Math.min(Math.max((area.radiusKm / 111) * 2.2, 0.03), 1.5);
  return {
    latitude: area.centerLat,
    longitude: area.centerLng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/**
 * Source of truth for "where does the app open the map / default the location
 * pickers". Reads the admin-configured service areas (cached 30 min — cities
 * change rarely) and resolves the default area (the one flagged is_default,
 * else the first active area, else null → FALLBACK_REGION). This is what makes
 * the launch city configurable in admin instead of hardcoded in the client.
 */
export function useServiceAreaDefaults(): {
  areas: ServiceArea[];
  defaultArea: ServiceArea | null;
  defaultRegion: MapRegion;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ['serviceAreas'],
    queryFn: getActiveServiceAreas,
    staleTime: 30 * 60 * 1000,
  });
  const { data, isLoading, isError } = query;
  const areas = data ?? [];
  const defaultArea = areas.find((a) => a.isDefault) ?? areas[0] ?? null;
  const defaultRegion = defaultArea ? regionForArea(defaultArea) : FALLBACK_REGION;
  return {
    areas,
    defaultArea,
    defaultRegion,
    isLoading,
    isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
