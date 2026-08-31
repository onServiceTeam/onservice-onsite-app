const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: queryMock,
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { updateProviderNote } from '../src/services/provider-admin.service';

it('Bug UX-752 — provider-note edits are provider-scoped and every successful body or pin change writes an audit event', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT author_id, category, body, pinned/.test(sql)) {
      if (params[1] === 'provider-a') return { rows: [], rowCount: 0 };
      return {
        rows: [{ author_id: 'admin-1', category: 'general', body: 'Old body', pinned: false }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });

  await expect(
    updateProviderNote('provider-a', 'note-from-provider-b', 'admin-1', true, { pinned: true }),
  ).rejects.toMatchObject({ statusCode: 404 });

  await updateProviderNote(
    'provider-b',
    'note-from-provider-b',
    'admin-1',
    true,
    { body: 'Updated support context', pinned: true },
  );

  const scopedSelect = calls.find((call) => /SELECT author_id, category, body, pinned/.test(call.sql));
  expect(scopedSelect?.sql).toMatch(/provider_id = \$2/);
  const scopedUpdate = calls.find((call) => /UPDATE provider_admin_notes/.test(call.sql));
  expect(scopedUpdate?.sql).toMatch(/provider_id = \$4/);
  const audit = calls.find((call) => /provider_note_updated/.test(call.sql));
  expect(audit).toBeDefined();
  expect(JSON.parse(String(audit?.params[2]))).toMatchObject({
    providerId: 'provider-b',
    bodyChanged: true,
    pinnedBefore: false,
    pinnedAfter: true,
  });
});
