const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => Promise<void>) =>
  callback({ query: queryMock }),
);

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: transactionMock },
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { deleteProviderNote } from '../src/services/provider-admin.service';

it('Bug UX-430 — the provider-note deletion service rejects a missing audit reason before mutating the note', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [
      {
        author_id: 'admin-1',
        provider_id: 'provider-1',
        deleted_at: null,
      },
    ],
    rowCount: 1,
  });

  await expect(
    deleteProviderNote('provider-1', 'note-1', 'admin-1', false),
  ).rejects.toMatchObject({
    statusCode: 400,
    message: 'reason must be at least 10 characters.',
  });
  expect(queryMock).toHaveBeenCalledTimes(1);
  expect(String(queryMock.mock.calls[0]?.[0])).toContain('SELECT author_id, provider_id, deleted_at');
});
