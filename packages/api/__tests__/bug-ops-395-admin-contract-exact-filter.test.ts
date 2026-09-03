jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { getContractsAdmin } from '../src/services/business.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-395 - an exact contract handoff stays scoped to both the owning account and contract', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'contract-395', business_account_id: 'account-395' }] })
    .mockResolvedValueOnce({ rows: [{ count: '1' }] });

  const result = await getContractsAdmin('account-395', 1, 20, 'contract-395');

  expect(result).toEqual({
    items: [{ id: 'contract-395', business_account_id: 'account-395' }],
    total: 1,
  });
  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/bc\.business_account_id = \$1[\s\S]*bc\.id = \$4/);
  expect(queryMock.mock.calls[0]?.[1]).toEqual(['account-395', 20, 0, 'contract-395']);
  expect(queryMock.mock.calls[1]?.[0]).toMatch(/business_account_id = \$1 AND id = \$2/);
  expect(queryMock.mock.calls[1]?.[1]).toEqual(['account-395', 'contract-395']);
});
