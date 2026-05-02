// LAUNCH-LIMITATIONS #3 + #4 — customer DSR history endpoint + DSR
// submission rate limit. Verifies the service-layer behaviour with
// mocked db.query.

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import * as compliance from '../src/services/compliance.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

beforeEach(() => {
  dbQueryMock.mockReset();
});

const USER_ID = '11111111-1111-4111-8111-111111111111';

function dsrRow(id: string, type: string, status: string): unknown {
  return {
    id,
    user_id: USER_ID,
    request_type: type,
    status,
    user_email: null,
    user_message: null,
    received_at: new Date(),
    due_at: new Date(Date.now() + 86_400_000 * 15),
    closed_at: null,
    fulfillment_url: null,
    rejection_reason: null,
    fulfillment_summary: null,
    info_request_message: null,
    info_request_at: null,
    escalated_to_npc_at: null,
    escalation_reference: null,
    assignee_id: null,
  };
}

describe('LAUNCH-LIMITATIONS #3 — listMyDsrs returns caller-scoped DSR list', () => {
  it('#3 — returns rows for the given userId, most recent first', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [dsrRow('a', 'access', 'pending'), dsrRow('b', 'erasure', 'completed')],
      rowCount: 2,
    });
    const result = await compliance.listMyDsrs(USER_ID);
    expect(result.length).toBe(2);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).toMatch(/ORDER BY received_at DESC/);
  });

  it('#3 — limit is clamped to [1, 200]', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await compliance.listMyDsrs(USER_ID, 9999);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/LIMIT 200/);
  });

  it('#3 — limit floors negative input to 1', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await compliance.listMyDsrs(USER_ID, -50);
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/LIMIT 1/);
  });

  it('#3 — empty userId throws 400', async () => {
    await expect(compliance.listMyDsrs('')).rejects.toMatchObject({
      message: expect.stringMatching(/userId is required/),
    });
  });
});

describe('LAUNCH-LIMITATIONS #4 — POST /dsr rate-limit logic verified at route shape', () => {
  it('#4 — compliance.routes.ts has the 5-per-24h guard wired', () => {
    const ROUTE = readFileSync(
      resolve(__dirname, '../src/routes/compliance.routes.ts'),
      'utf8',
    );
    expect(ROUTE).toMatch(/DSR_OPEN_LIMIT_PER_USER_24H = 5/);
    expect(ROUTE).toMatch(/received_at >= NOW\(\) - INTERVAL '24 hours'/);
    expect(ROUTE).toMatch(/recentCount >= DSR_OPEN_LIMIT_PER_USER_24H/);
    // Multi-line createAppError with 429 status code.
    expect(ROUTE).toMatch(/createAppError\(/);
    expect(ROUTE).toMatch(/429,?\s*\)/);
  });

  it('#4 — /my-requests route exists', () => {
    const ROUTE = readFileSync(
      resolve(__dirname, '../src/routes/compliance.routes.ts'),
      'utf8',
    );
    expect(ROUTE).toMatch(/router\.get\(\s*['"]\/my-requests['"]/);
    expect(ROUTE).toMatch(/compliance\.listMyDsrs/);
  });
});
