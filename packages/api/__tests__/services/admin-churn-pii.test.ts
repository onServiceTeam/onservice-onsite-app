const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getChurnPrediction } from '../../src/services/admin-analytics.service';

const row = {
  user_id: 'customer-1',
  name: 'Ana Reyes',
  phone: '+639171234567',
  last_booking_date: new Date('2026-08-01T00:00:00Z'),
  days_since_last: 24,
  total_bookings: '3',
  total_spent: '250000',
  risk_score: 25,
  risk_level: 'low',
};

describe('Admin churn analytics contact privacy', () => {
  beforeEach(() => dbQueryMock.mockReset());

  it('Bug UX-338 — ordinary admins receive a masked customer phone while super-admin receives the original', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const ordinary = await getChurnPrediction(1, 20, undefined, 'admin');
    const privileged = await getChurnPrediction(1, 20, undefined, 'super_admin');

    expect(ordinary.items[0]).toMatchObject({
      phone: '+63 9XX XXX 4567',
      contactMasked: true,
      totalBookedValue: 250000,
    });
    expect(privileged.items[0]).toMatchObject({
      phone: '+639171234567',
      contactMasked: false,
    });
  });
});
