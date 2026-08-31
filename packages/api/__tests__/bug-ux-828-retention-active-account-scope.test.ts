const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getChurnPrediction } from '../src/services/admin-analytics.service';

it('Bug UX-828 — retention attention excludes inactive accounts from the operational outreach queue', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ count: '0' }] });

  await getChurnPrediction(1, 20, undefined, 'admin');

  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  expect(String(dbQueryMock.mock.calls[0]?.[0])).toContain('u.is_active = TRUE');
  expect(String(dbQueryMock.mock.calls[1]?.[0])).toContain('u.is_active = TRUE');
});
