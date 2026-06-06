// A5 — lockWalletsForUpdate acquires row locks on a set of wallets in a
// deterministic (id) order with FOR UPDATE, so concurrent money transactions
// serialize on shared rows (the platform escrow wallet) without lock-ordering
// deadlocks. This drives the real function with a recording fake client and
// asserts the SQL it emits.

jest.mock('../../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

import { lockWalletsForUpdate } from '../../src/services/wallet.service';

type RecordedClient = Parameters<typeof lockWalletsForUpdate>[0];

function recordingClient(): { client: RecordedClient; calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    },
  } as unknown as RecordedClient;
  return { client, calls };
}

describe('A5 — lockWalletsForUpdate', () => {
  it('issues a single ORDER BY id ... FOR UPDATE over the given wallet ids', async () => {
    const { client, calls } = recordingClient();
    await lockWalletsForUpdate(client, [
      '99999999-9999-9999-9999-999999999999',
      '11111111-1111-1111-1111-111111111111',
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/ORDER BY id/);
    expect(calls[0]!.sql).toMatch(/FOR UPDATE/);
    expect(calls[0]!.sql).toMatch(/= ANY\(\$1::uuid\[\]\)/);
  });

  it('dedupes ids and drops null/undefined before locking', async () => {
    const { client, calls } = recordingClient();
    await lockWalletsForUpdate(client, ['a', 'b', 'a', null, undefined, 'b']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params[0]).toEqual(['a', 'b']);
  });

  it('is a no-op (no query) when there are no real wallet ids', async () => {
    const { client, calls } = recordingClient();
    await lockWalletsForUpdate(client, [null, undefined]);
    expect(calls).toHaveLength(0);
  });
});
