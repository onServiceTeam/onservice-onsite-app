// Audit fix — createContract must bound its money fields. A negative agreedRate
// (creates credits) or a discount outside 0..100 (negative invoice total)
// corrupts B2B invoicing. The member-permission lookup runs first; the bounds
// throw before the INSERT.

const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...a: unknown[]) => queryMock(...a), transaction: jest.fn() },
}));

import { createContract } from '../src/services/business.service';

const BASE = {
  businessAccountId: 'b1',
  categoryId: 'c1',
  contractType: 'recurring' as const,
  agreedRate: 50000,
  startDate: '2026-07-01',
};

beforeEach(() => {
  queryMock.mockReset();
  // First query is always the member-permission lookup; grant permission.
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'owner', can_approve: true }], rowCount: 1 });
});

describe('createContract — money-field bounds', () => {
  it('rejects a negative agreedRate', async () => {
    await expect(createContract({ ...BASE, agreedRate: -100 }, 'u1')).rejects.toThrow(/non-negative/i);
  });

  it('rejects a discount above 100%', async () => {
    await expect(createContract({ ...BASE, discountPercentage: 150 }, 'u1')).rejects.toThrow(/between 0 and 100/i);
  });

  it('rejects a negative discount', async () => {
    await expect(createContract({ ...BASE, discountPercentage: -5 }, 'u1')).rejects.toThrow(/between 0 and 100/i);
  });

  it('rejects a negative estimatedMonthlyValue', async () => {
    await expect(createContract({ ...BASE, estimatedMonthlyValue: -1 }, 'u1')).rejects.toThrow(/cannot be negative/i);
  });

  it('accepts valid bounds (proceeds to INSERT)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'ct1', agreed_rate: 50000, discount_percentage: 10 }], rowCount: 1 }); // INSERT
    const row = await createContract({ ...BASE, discountPercentage: 10, estimatedMonthlyValue: 100000 }, 'u1');
    expect(row).toBeTruthy();
  });
});
