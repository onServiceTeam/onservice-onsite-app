const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { updateContractStatus, type BusinessContractStatus } from '../src/services/business.service';

it('MED-N41 — contract status accepts the complete database lifecycle and rejects unknown values before database work', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'contract-1', business_account_id: 'business-1' }] })
    .mockResolvedValueOnce({ rows: [{ role: 'owner', can_approve: true }] })
    .mockResolvedValueOnce({ rows: [{ id: 'contract-1', status: 'expired' }] });

  const expired = await updateContractStatus('contract-1', 'owner-1', 'expired');
  await expect(updateContractStatus(
    'contract-1',
    'owner-1',
    'invented' as BusinessContractStatus,
  )).rejects.toMatchObject({ statusCode: 400 });

  expect(expired).toMatchObject({ status: 'expired' });
  expect(dbQueryMock).toHaveBeenCalledTimes(3);
});
