jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listPayouts } from '../src/services/payout.service';

it('Bug UX-733 — payout provider search constrains both count and returned-row queries by business or user name', async () => {
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'payout-1', provider_business_name: 'Cebu Home Care' }] });

  await listPayouts({ search: 'Cebu Home', page: 1, pageSize: 20 });

  expect(queryMock).toHaveBeenNthCalledWith(
    1,
    expect.stringMatching(/business_name ILIKE \$1[\s\S]*first_name[\s\S]*last_name[\s\S]*provider_id::text ILIKE \$1/),
    ['%Cebu Home%'],
  );
  expect(queryMock).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(/COALESCE\([\s\S]*business_name[\s\S]*first_name[\s\S]*last_name[\s\S]*business_name ILIKE \$1[\s\S]*provider_id::text ILIKE \$1/),
    ['%Cebu Home%', 20, 0],
  );
});
