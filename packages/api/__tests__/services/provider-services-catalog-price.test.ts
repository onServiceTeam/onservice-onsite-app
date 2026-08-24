jest.mock('../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { db } from '../../src/models/db';
import { addProviderService } from '../../src/services/provider.service';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

it('Bug OPS-224 — adding a provider service cannot write a personal price', async () => {
  mockedQuery
    .mockResolvedValueOnce({
      rows: [{ id: 'subcat-1', name: 'General Cleaning', category_id: 'cat-1' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'provider-service-1',
        provider_id: 'provider-1',
        subcategory_id: 'subcat-1',
        category_id: 'cat-1',
        base_price: null,
        is_active: true,
      }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

  const result = await addProviderService('provider-1', 'subcat-1');

  expect(result.base_price).toBeNull();
  expect(mockedQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('VALUES ($1, $2, $3, NULL)'),
    ['provider-1', 'subcat-1', 'cat-1'],
  );
});
