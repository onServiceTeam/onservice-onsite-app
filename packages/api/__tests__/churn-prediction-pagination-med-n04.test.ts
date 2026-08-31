const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getChurnPrediction } from '../src/services/admin-analytics.service';

it('MED-N04 — churn scoring, filtering, and pagination execute in the database and return the paired total', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      user_id: 'customer-1', name: 'Ana Reyes', phone: '+639171234567',
      last_booking_date: null, days_since_last: 999, total_bookings: '0',
      total_spent: '0', risk_score: 100, risk_level: 'critical',
    }] })
    .mockResolvedValueOnce({ rows: [{ count: '41' }] });

  const result = await getChurnPrediction(2, 20, 'critical', 'admin');

  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  expect(String(dbQueryMock.mock.calls[0]?.[0])).toContain('WITH scored AS');
  expect(String(dbQueryMock.mock.calls[0]?.[0])).toContain('LIMIT $2 OFFSET $3');
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual(['critical', 20, 20]);
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(['critical']);
  expect(result).toMatchObject({ total: 41, items: [{ riskScore: 100, riskLevel: 'critical' }] });
});
