const clientQueryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof clientQueryMock }) => unknown) => (
  callback({ query: clientQueryMock })
));

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ sendPushNotification: jest.fn() }));

import { createTemplate } from '../src/services/provider-crm.service';

it('Bug UX-280 — quote templates can only link to an active service offered by the authenticated provider', async () => {
  const createdAt = new Date('2026-08-25T00:00:00.000Z');
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ category_id: 'category-1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{ id: 'template-1', provider_id: 'provider-1', category_id: 'category-1', subcategory_id: 'subcategory-1', name: 'Aircon clean', created_at: createdAt }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const result = await createTemplate('provider-1', {
    name: 'Aircon clean',
    subcategoryId: 'subcategory-1',
    items: [{ description: 'Coil clean', quantity: 1, unit: 'unit', unitPrice: 50000 }],
  });

  expect(clientQueryMock.mock.calls[0][0]).toMatch(/JOIN provider_services/);
  expect(clientQueryMock.mock.calls[0][1]).toEqual(['provider-1', 'subcategory-1']);
  expect(clientQueryMock.mock.calls[1][1]).toEqual([
    'provider-1', 'category-1', 'subcategory-1', 'Aircon clean',
  ]);
  expect(result).toMatchObject({ categoryId: 'category-1', subcategoryId: 'subcategory-1' });
});
