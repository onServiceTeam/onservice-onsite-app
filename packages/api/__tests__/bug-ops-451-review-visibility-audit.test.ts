const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }));
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (callback: unknown) => transactionMock(callback) },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { setReviewVisibility } from '../src/services/provider-admin.service';

it('Bug OPS-451 — review visibility changes are provider-scoped and audited atomically with the moderation reason', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ is_visible: true }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }], rowCount: 1 });

  await setReviewVisibility(
    'provider-1', 'review-1', false,
    'Contains private contact information.', 'admin-1',
  );

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[0][1]).toEqual(['review-1', 'provider-1']);
  expect(queryMock.mock.calls[1][1]).toEqual([false, 'review-1', 'provider-1']);
  expect(queryMock.mock.calls[2][0]).toContain("'review_visibility_changed', 'review'");
  expect(queryMock.mock.calls[2][1]).toEqual(expect.arrayContaining([
    'admin-1', 'review-1', 'Contains private contact information.',
  ]));
});
