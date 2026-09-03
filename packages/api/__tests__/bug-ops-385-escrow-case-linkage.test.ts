const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getEscrowSummary } from '../src/services/financial-admin.service';

it('Bug OPS-385 — escrow releases preserve canonical customer and provider case identifiers', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ available: '100000', pending: '200000' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ bucket: '0-24h', count: '1', total: '300000' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        booking_id: '38500000-0000-4000-8000-000000000001',
        customer_id: '38500000-0000-4000-8000-000000000002',
        customer_name: 'Escrow Customer',
        provider_id: '38500000-0000-4000-8000-000000000003',
        provider_name: 'Escrow Provider',
        amount: '300000',
        completed_at: new Date('2026-09-03T00:00:00.000Z'),
        age_hours: '2',
        bucket: '0-24h',
      }],
      rowCount: 1,
    });

  const result = await getEscrowSummary();

  expect(result.pendingReleaseList[0]).toMatchObject({
    bookingId: '38500000-0000-4000-8000-000000000001',
    customerId: '38500000-0000-4000-8000-000000000002',
    providerId: '38500000-0000-4000-8000-000000000003',
  });
  expect(dbQueryMock.mock.calls[2]?.[0]).toContain('b.customer_id::text');
  expect(dbQueryMock.mock.calls[2]?.[0]).toContain('b.provider_id::text');
});
