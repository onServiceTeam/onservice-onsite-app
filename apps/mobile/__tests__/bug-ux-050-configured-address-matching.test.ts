import { matchConfiguredAreasForQuery, matchRegionForQuery } from '../src/utils/ph-regions';

it('Bug UX-050 — a Mandaue address wins over the shared Cebu province and only configured service areas are suggested', () => {
  const configured = [
    { id: 'cebu', name: 'Cebu City', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854 },
    { id: 'mandaue', name: 'Mandaue', city: 'Mandaue', province: 'Cebu', centerLat: 10.3236, centerLng: 123.9223 },
  ];

  expect(matchRegionForQuery('A.S. Fortuna St, Mandaue City, Cebu')).toMatchObject({ city: 'Mandaue' });
  expect(matchConfiguredAreasForQuery('A.S. Fortuna St, Mandaue City, Cebu', configured)).toEqual([
    expect.objectContaining({ id: 'mandaue' }),
  ]);
  expect(matchConfiguredAreasForQuery('Makati City', configured)).toEqual([]);
});
