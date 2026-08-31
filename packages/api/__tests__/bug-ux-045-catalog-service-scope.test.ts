jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createSubcategory, updateSubcategory } from '../src/services/catalog.service';
import { resetDbMock, setTxQueryImpl, makeRouter, getTransactionInvocations } from './helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const SUBCATEGORY_ID = '33333333-3333-3333-3333-333333333333';

beforeEach(resetDbMock);

it('Bug UX-045 — prevents active services from being created or edited without customer scope', async () => {
  await expect(createSubcategory({
    categoryId: CATEGORY_ID,
    name: 'Deep cleaning',
    description: 'Too short',
    basePrice: 50000,
  }, ADMIN_ID)).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringContaining('Customer service scope must be at least 30 characters'),
  });

  setTxQueryImpl(makeRouter([{
    match: /SELECT description, is_active, base_price/,
    rows: [{
      description: '', is_active: true, base_price: 50000, min_price: null, max_price: null,
      pricing_type: 'fixed', unit_label: null, unit_price: null, hourly_rate: null,
    }],
    rowCount: 1,
  }]));

  await expect(updateSubcategory(SUBCATEGORY_ID, { basePrice: 55000 }, ADMIN_ID)).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringContaining('Customer service scope'),
  });
  expect(getTransactionInvocations()).toBe(1);
});
