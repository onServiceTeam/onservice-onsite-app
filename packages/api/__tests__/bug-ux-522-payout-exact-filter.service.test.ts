jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listPayouts } from '../src/services/payout.service';

it('Bug UX-522 — exact payout filtering constrains both count and returned-row queries', async () => {
  const payoutId = '66666666-6666-4666-8666-666666666666';
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: payoutId, provider_id: 'provider-1' }] });

  const result = await listPayouts({ payoutId, page: 1, pageSize: 20 });

  expect(result.total).toBe(1);
  expect(result.payouts).toEqual([{ id: payoutId, provider_id: 'provider-1' }]);
  expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE p.id = $1'), [payoutId]);
  expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining('WHERE p.id = $1'), [payoutId, 20, 0]);
});
