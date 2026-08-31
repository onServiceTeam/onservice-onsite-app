const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { getRevenueReport } from '../src/services/admin.service';

it('Bug UX-736 — legacy admin revenue reports count the negative refund debit once instead of both wallet sides', async () => {
  queryMock.mockResolvedValueOnce({ rows: [] });

  await getRevenueReport('daily', 30);

  expect(queryMock).toHaveBeenCalledWith(
    expect.stringContaining("wt.type = 'refund' AND wt.amount < 0 THEN -wt.amount"),
    [30],
  );
  expect(queryMock.mock.calls[0]?.[0]).not.toContain('ABS(wt.amount)');
});
