const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug MED-N12 — escrow aging totals use the complete backlog independently of the bounded detail page', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ available: '100000', pending: '200000' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [
        { bucket: '48-168h', count: '600', total: '600000' },
        { bucket: '168h+', count: '100', total: '300000' },
      ],
      rowCount: 2,
    })
    .mockResolvedValueOnce({
      rows: [{
        booking_id: 'booking-1', customer_name: 'Maria Santos', provider_name: 'Cebu Pro',
        amount: '100000', completed_at: new Date('2026-08-20T00:00:00.000Z'),
        age_hours: '240', bucket: '168h+',
      }],
      rowCount: 1,
    });

  const result = await financialAdminService.getEscrowSummary();

  expect(result.pendingReleaseCount).toBe(700);
  expect(result.agingBuckets).toEqual([
    { bucket: '0-24h', count: 0, totalCentavos: 0 },
    { bucket: '24-48h', count: 0, totalCentavos: 0 },
    { bucket: '48-168h', count: 600, totalCentavos: 600000 },
    { bucket: '168h+', count: 100, totalCentavos: 300000 },
  ]);
  expect(result.pendingReleaseList).toHaveLength(1);
  expect(queryMock.mock.calls[1]?.[0]).not.toContain('LIMIT');
  expect(queryMock.mock.calls[2]?.[1]).toEqual([25, 0]);
});
