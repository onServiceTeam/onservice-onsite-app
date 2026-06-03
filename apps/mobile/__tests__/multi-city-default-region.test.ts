// Multi-city — the mobile apps center the map and default their location
// pickers on the admin-configured default service area, not a hardcoded city.
// These assert the real outputs of the shared helpers in useServiceAreaDefaults.

import { FALLBACK_REGION, regionForArea } from '../src/hooks/useServiceAreaDefaults';
import type { ServiceArea } from '../src/services/service-area.service';

function makeArea(over: Partial<ServiceArea>): ServiceArea {
  return {
    id: 'a1', name: 'Test', slug: 'test', city: 'Test', province: 'P', region: 'R',
    zipCodes: [], centerLat: 0, centerLng: 0, radiusKm: 15, status: 'active',
    launchDate: null, launchedAt: null, minProvidersToLaunch: 5,
    activeProviderCount: 0, activeCustomerCount: 0, totalBookings: 0,
    isDefault: false, createdAt: '', updatedAt: '', ...over,
  };
}

describe('Multi-city default region helpers', () => {
  it('offline fallback region is central Metro Cebu (the default launch market)', () => {
    expect(FALLBACK_REGION.latitude).toBeCloseTo(10.3157, 4);
    expect(FALLBACK_REGION.longitude).toBeCloseTo(123.8854, 4);
    expect(FALLBACK_REGION.latitudeDelta).toBeGreaterThan(0);
    expect(FALLBACK_REGION.longitudeDelta).toBeGreaterThan(0);
  });

  it('regionForArea centers on the area coordinates', () => {
    const region = regionForArea(makeArea({ centerLat: 7.0732, centerLng: 125.6126, radiusKm: 20 }));
    expect(region.latitude).toBeCloseTo(7.0732, 4);
    expect(region.longitude).toBeCloseTo(125.6126, 4);
  });

  it('regionForArea zooms wider for a larger service radius', () => {
    const small = regionForArea(makeArea({ radiusKm: 5 }));
    const large = regionForArea(makeArea({ radiusKm: 50 }));
    expect(large.latitudeDelta).toBeGreaterThan(small.latitudeDelta);
  });

  it('regionForArea clamps deltas to a usable range for tiny and huge radii', () => {
    const tiny = regionForArea(makeArea({ radiusKm: 1 }));
    const huge = regionForArea(makeArea({ radiusKm: 100 }));
    expect(tiny.latitudeDelta).toBeGreaterThanOrEqual(0.03);
    expect(huge.latitudeDelta).toBeLessThanOrEqual(1.5);
  });
});
