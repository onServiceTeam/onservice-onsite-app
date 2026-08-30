const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getCitiesPerformance } from '../src/services/admin-analytics.service';

it('Bug UX-506 — city performance counts bookings by their recorded city/province and providers from live approved-area membership', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: 'area-1', name: 'Cebu City', status: 'active',
    active_provider_count: '4', today_bookings: '3',
  }] });

  const result = await getCitiesPerformance();
  const sql = String(dbQueryMock.mock.calls[0]?.[0]);

  expect(result).toEqual([{
    id: 'area-1', name: 'Cebu City', status: 'active', activeProviders: 4, todayBookings: 3,
  }]);
  expect(sql).toContain('LOWER(TRIM(b.city)) = LOWER(TRIM(sa.city))');
  expect(sql).toContain('LOWER(TRIM(b.province)) = LOWER(TRIM(sa.province))');
  expect(sql).toContain("p.status = 'approved'");
  expect(sql).not.toContain('JOIN provider_service_areas psa ON psa.provider_id = b.provider_id');
});
