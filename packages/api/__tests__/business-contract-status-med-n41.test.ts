const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { updateContractStatus, type BusinessContractStatus } from '../src/services/business.service';

it('MED-N41 — direct customer contract lifecycle writes are retired and unknown values still fail validation', async () => {
  await expect(updateContractStatus('contract-1', 'owner-1', 'expired'))
    .rejects.toMatchObject({ statusCode: 403 });
  await expect(updateContractStatus(
    'contract-1',
    'owner-1',
    'invented' as BusinessContractStatus,
  )).rejects.toMatchObject({ statusCode: 400 });

  expect(dbQueryMock).not.toHaveBeenCalled();
});
