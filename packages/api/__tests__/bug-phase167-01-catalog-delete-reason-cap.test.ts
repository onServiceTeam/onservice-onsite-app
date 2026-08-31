jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { deleteAddon, deleteSubcategory } from '../src/services/catalog.service';
import { getTransactionInvocations, resetDbMock } from './helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SUBCATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const ADDON_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(resetDbMock);

describe('BUG-PHASE167-01 — catalog lifecycle reason bounds', () => {
  it('rejects missing or short reasons for both deactivation paths before database work', async () => {
    await expect(deleteSubcategory(SUBCATEGORY_ID, ADMIN_ID, '')).rejects.toMatchObject({ statusCode: 400 });
    await expect(deleteAddon(ADDON_ID, ADMIN_ID, 'short')).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects reasons above 2000 characters for both deactivation paths before database work', async () => {
    const tooLong = 'x'.repeat(2001);
    await expect(deleteSubcategory(SUBCATEGORY_ID, ADMIN_ID, tooLong)).rejects.toMatchObject({ statusCode: 400 });
    await expect(deleteAddon(ADDON_ID, ADMIN_ID, tooLong)).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });
});
