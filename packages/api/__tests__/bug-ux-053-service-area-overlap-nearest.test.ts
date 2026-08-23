const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { checkCoverage } from '../src/services/service-area.service';

it('Bug UX-053 — overlapping Metro Cebu radii resolve to the nearest covered service-area center', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [
      { id: 'cebu', center_lat: '10.3157', center_lng: '123.8854', radius_km: 15 },
      { id: 'mandaue', center_lat: '10.3236', center_lng: '123.9223', radius_km: 12 },
    ],
    rowCount: 2,
  });

  const result = await checkCoverage(10.3236, 123.9223);

  expect(result.covered).toBe(true);
  expect(result.area?.id).toBe('mandaue');
});
