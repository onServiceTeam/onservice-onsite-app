const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug UX-739 — escrow detail supports bounded pages while aging totals remain complete', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ available: '100000', pending: '200000' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{ bucket: '168h+', count: '700', total: '900000' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const result = await financialAdminService.getEscrowSummary({ limit: 50, offset: 100 });

  expect(result.pendingReleaseCount).toBe(700);
  expect(queryMock.mock.calls[1]?.[0]).not.toContain('LIMIT');
  expect(queryMock.mock.calls[2]?.[0]).toContain('ORDER BY b.completed_at NULLS LAST, b.id');
  expect(queryMock.mock.calls[2]?.[0]).toContain('LIMIT $1 OFFSET $2');
  expect(queryMock.mock.calls[2]?.[1]).toEqual([50, 100]);
});
