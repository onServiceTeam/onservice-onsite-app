const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getOperationalAlerts } from '../src/services/admin-analytics.service';

it('Bug UX-513 — operational city and guarantee-fund alerts return real filtered admin routes instead of nonexistent paths', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'area-1', name: 'Cebu City', active_provider_count: 2 }] })
    .mockResolvedValueOnce({ rows: [{ balance: '100', burn: '1000' }] });

  const result = await getOperationalAlerts();

  expect(result.find((alert) => alert.type === 'city_low_provider_count')?.action_url)
    .toBe('/service-areas?search=Cebu%20City');
  expect(result.find((alert) => alert.type === 'guarantee_fund_low')?.action_url)
    .toBe('/financials?tab=guarantee');
});
