jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createAddon,
  createCategory,
  createSubcategory,
  updateAddon,
  updateCategory,
  updateSubcategory,
} from '../src/services/catalog.service';
import { getTransactionInvocations, resetDbMock } from './helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const SUBCATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const ADDON_ID = '44444444-4444-4444-4444-444444444444';
const SCOPE = 'Includes the agreed service work and its important customer-facing limits.';

beforeEach(resetDbMock);

describe('BUG-PHASE163-01 — catalog server caps', () => {
  it('rejects overlong category fields before any database transaction', async () => {
    await expect(createCategory({ name: 'x'.repeat(101) }, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateCategory(CATEGORY_ID, { iconUrl: `https://example.com/${'x'.repeat(500)}` }, ADMIN_ID))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects overlong service fields before any database transaction', async () => {
    await expect(createSubcategory({
      categoryId: CATEGORY_ID,
      name: 'x'.repeat(101),
      description: SCOPE,
      basePrice: 10000,
    }, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateSubcategory(SUBCATEGORY_ID, { description: 'x'.repeat(2001) }, ADMIN_ID))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects overlong add-on fields before any database transaction', async () => {
    await expect(createAddon({
      subcategoryId: SUBCATEGORY_ID,
      name: 'x'.repeat(101),
      price: 1000,
    }, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateAddon(ADDON_ID, { description: 'x'.repeat(2001) }, ADMIN_ID))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });
});
