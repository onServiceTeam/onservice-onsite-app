// CR-207 (D24 Option A, 2026-10-18 review): Google can label a housing
// development (a subdivision, an estate, a phase) as "neighborhood". When no
// part looks like a barangay, the mapper leaves the barangay empty for the
// customer instead of prefilling the development's name. The check is narrow:
// real barangays whose official names contain "Village" or "Homes" (Teachers
// Village East in Quezon City, BF Homes in Parañaque) are still prefilled.
// Fixtures are realistic shapes, UNVERIFIED against live Google answers.
import { mapAddressComponents, type AddressComponent } from '../src/services/geo/address-search.service';

const part = (longText: string, types: string[]): AddressComponent => ({ longText, shortText: longText, types });

function cebuAddressWithNeighborhood(name: string): AddressComponent[] {
  return [
    part('Gov. M. Cuenco Avenue', ['route']),
    part(name, ['neighborhood', 'political']),
    part('Cebu City', ['locality', 'political']),
    part('Cebu', ['administrative_area_level_2', 'political']),
    part('Philippines', ['country', 'political']),
  ];
}

it('Bug CR-207 — a subdivision, estate or phase named as the neighborhood is never prefilled as the barangay, but real barangays with Village or Homes are', () => {
  for (const development of ['Villa Verde Subdivision', 'Sunny Hills Subd.', 'Maria Luisa Estate Park', 'Northwoods Estates', 'Avida Residences', 'Pacific Grand Villas Phase 2']) {
    expect({ development, barangay: mapAddressComponents(cebuAddressWithNeighborhood(development)).barangay })
      .toEqual({ development, barangay: null });
  }

  // A later candidate that is a barangay still wins over a skipped development.
  const withSublocality = [
    ...cebuAddressWithNeighborhood('Villa Verde Subdivision'),
    part('Talamban', ['sublocality', 'political']),
  ];
  expect(mapAddressComponents(withSublocality).barangay).toBe('Talamban');

  // Official barangay names that carry "Village" or "Homes" are kept.
  const quezonCity = [
    part('Maginhawa Street', ['route']),
    part('Teachers Village East', ['neighborhood', 'political']),
    part('Quezon City', ['locality', 'political']),
    part('Metro Manila', ['administrative_area_level_1', 'political']),
  ];
  expect(mapAddressComponents(quezonCity).barangay).toBe('Teachers Village East');
  const paranaque = [
    part('Aguirre Avenue', ['route']),
    part('BF Homes', ['sublocality_level_1', 'sublocality', 'political']),
    part('Parañaque', ['locality', 'political']),
    part('Metro Manila', ['administrative_area_level_1', 'political']),
  ];
  expect(mapAddressComponents(paranaque).barangay).toBe('BF Homes');
});
