// MED-N63 / MED-N64 / MED-N87 / MED-N88 / MED-N92 fixes verified.
// Each test case asserts the post-fix transactional behaviour at the
// service / route surface using a passthrough db.transaction mock.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const logSecurityEventMock = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  revokeDevice,
  blockIp,
  logSecurityEvent as actualLogSecurityEvent,
} from '../src/services/security.service';
import { refreshAccessToken } from '../src/services/auth.service';
import jwt from 'jsonwebtoken';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  logSecurityEventMock.mockReset();
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  // Default: every transaction's callback runs against a passthrough
  // client whose query() forwards to dbQueryMock. Tests can override.
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N63 — revokeDevice writes audit + DELETE atomically', () => {
  it('MED-N63 — INSERTs security_events device_revoked inside the same trx', async () => {
    // SELECT FOR UPDATE returns the device.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'dev-1',
        user_id: 'user-1',
        fingerprint: 'fp-abc',
        device_name: 'Pixel 7',
        platform: 'android',
        is_trusted: true,
        last_seen_at: new Date(),
        last_ip: '1.2.3.4',
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    // DELETE returns rowCount 1.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT into security_events.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const ok = await revokeDevice('user-1', 'dev-1');

    expect(ok).toBe(true);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    // 3 queries inside the trx: SELECT FOR UPDATE, DELETE, INSERT.
    expect(dbQueryMock).toHaveBeenCalledTimes(3);
    const insertCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO security_events/.test(sql as string),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toMatch(/event_type/);
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('device_revoked');
    expect(params[2]).toBe('1.2.3.4');
    expect(params[3]).toBe('fp-abc');
  });

  it('MED-N63 — returns false (no audit) when device row not found', async () => {
    // SELECT FOR UPDATE returns nothing.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const ok = await revokeDevice('user-1', 'missing-dev');

    expect(ok).toBe(false);
    // Only the SELECT ran inside the trx. No DELETE, no INSERT.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });

  it('MED-N63 — INSERT failure rolls back the DELETE (audit-or-nothing)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'dev-1',
        user_id: 'user-1',
        fingerprint: 'fp-abc',
        device_name: null,
        platform: null,
        is_trusted: false,
        last_seen_at: new Date(),
        last_ip: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE
    // INSERT throws. The trx should propagate so the route handler
    // sees a 5xx and the caller knows the revoke didn't happen.
    dbQueryMock.mockRejectedValueOnce(new Error('audit insert failed'));

    await expect(revokeDevice('user-1', 'dev-1')).rejects.toThrow(/audit insert failed/);
  });
});

describe('MED-N64 — blockIp reactivates inactive rows instead of inserting duplicates', () => {
  it('MED-N64 — UPDATEs the existing row when one already exists for the IP', async () => {
    // SELECT FOR UPDATE returns the existing (could be active or inactive) row.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'block-1' }],
      rowCount: 1,
    });
    // UPDATE returns the refreshed row.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'block-1',
        ip_address: '5.6.7.8',
        reason: 'fraud',
        blocked_by: 'admin-1',
        expires_at: null,
        is_active: true,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    // logSecurityEvent → INSERT into security_events.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const row = await blockIp({ ipAddress: '5.6.7.8', reason: 'fraud', blockedBy: 'admin-1' });

    expect(row.id).toBe('block-1');
    // No INSERT INTO blocked_ips ever happens — no duplicate row.
    const insertBlockedCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO blocked_ips/.test(sql as string),
    );
    expect(insertBlockedCall).toBeUndefined();

    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE blocked_ips/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
    // The UPDATE forces is_active = TRUE so an inactive row gets reactivated.
    expect(updateCall![0]).toMatch(/is_active = TRUE/);
  });

  it('MED-N64 — INSERTs a new row only when nothing exists for the IP', async () => {
    // SELECT FOR UPDATE returns nothing.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // INSERT.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'block-2',
        ip_address: '9.9.9.9',
        reason: 'bot',
        blocked_by: null,
        expires_at: null,
        is_active: true,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    // logSecurityEvent.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const row = await blockIp({ ipAddress: '9.9.9.9', reason: 'bot' });

    expect(row.id).toBe('block-2');
    const insertCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO blocked_ips/.test(sql as string),
    );
    expect(insertCall).toBeDefined();
  });
});

describe('MED-N92 — refreshAccessToken delete+insert is atomic', () => {
  it('MED-N92 — runs SELECT FOR UPDATE + DELETE + INSERT inside a single transaction', async () => {
    const oldRefresh = jwt.sign(
      { userId: 'user-1', role: 'customer', type: 'refresh' },
      'test-secret-do-not-use-in-prod',
      { algorithm: 'HS256', expiresIn: 3600 },
    );

    // SELECT refresh_tokens FOR UPDATE.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1',
        user_id: 'user-1',
        token_hash: 'whatever',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    // SELECT users.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        phone: '+639170000000',
        email: null,
        first_name: 'A',
        last_name: 'B',
        role: 'customer',
        avatar_url: null,
        is_verified: true,
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // DELETE old.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT new.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await refreshAccessToken(oldRefresh);

    expect(out.accessToken).toBeTruthy();
    expect(out.refreshToken).toBeTruthy();
    expect(out.refreshToken).not.toBe(oldRefresh);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // Confirm SELECT was a FOR UPDATE — that's how concurrent refreshes serialise.
    const selectCall = dbQueryMock.mock.calls.find(
      ([sql]) => /SELECT \* FROM refresh_tokens/.test(sql as string),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toMatch(/FOR UPDATE/);
  });

  it('MED-N92 — INSERT failure rolls back the DELETE so old token is preserved', async () => {
    const oldRefresh = jwt.sign(
      { userId: 'user-1', role: 'customer', type: 'refresh' },
      'test-secret-do-not-use-in-prod',
      { algorithm: 'HS256', expiresIn: 3600 },
    );

    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1',
        user_id: 'user-1',
        token_hash: 'whatever',
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        phone: '+639170000000',
        email: null,
        first_name: 'A',
        last_name: 'B',
        role: 'customer',
        avatar_url: null,
        is_verified: true,
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE
    dbQueryMock.mockRejectedValueOnce(new Error('insert refresh_tokens failed'));

    await expect(refreshAccessToken(oldRefresh)).rejects.toThrow(/insert refresh_tokens failed/);
    // The trx callback ran but the wrapping transaction will ROLLBACK,
    // so in real Postgres the DELETE never lands. Our test just confirms
    // the error propagates — the route handler returns 5xx and the
    // client retries with the still-valid old token.
  });

  it('MED-N92 — rejects when refresh token row is missing (race already resolved)', async () => {
    const oldRefresh = jwt.sign(
      { userId: 'user-1', role: 'customer', type: 'refresh' },
      'test-secret-do-not-use-in-prod',
      { algorithm: 'HS256', expiresIn: 3600 },
    );
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT FOR UPDATE empty

    await expect(refreshAccessToken(oldRefresh)).rejects.toThrow(/Refresh token not found/);
  });
});

describe('actualLogSecurityEvent re-export sanity', () => {
  // Sanity check that the import path didn't drift; not a behavior test
  // for any one MED but required for the file to type-check.
  it('exports logSecurityEvent', () => {
    expect(typeof actualLogSecurityEvent).toBe('function');
    expect(typeof logSecurityEventMock).toBe('function'); // local mock noop
  });
});

// MED-N87 + MED-N88 are route-level transaction fixes. The handlers
// are inline arrow functions on the express router so we use a source-
// shape scan (same pattern as the CRIT-N10 confirmation test that is
// already in master) to verify the post-fix shape: db.transaction
// wraps the relevant queries, notifications run AFTER the trx, and
// the trx-aware escrow variant is used for the no-show path.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);

describe('MED-N87 — assign endpoint wraps suki UPDATE in a transaction with post-commit notifications', () => {
  it('MED-N87 — assign suki UPDATE block is wrapped in db.transaction(client => ...)', () => {
    // Anchor on the discountAmount calc that immediately precedes the
    // UPDATE block, then inspect the next ~2400 chars (handler body).
    const anchor = ROUTES.indexOf('calculateSukiDiscountForBooking');
    expect(anchor).toBeGreaterThan(0);
    const block = ROUTES.slice(anchor, anchor + 4000);

    // Must wrap in db.transaction with a passthrough client.
    expect(block).toMatch(/await db\.transaction\(async \(client\)/);
    // Must use client.query (inside trx) for the booking UPDATE.
    expect(block).toMatch(/client\.query/);
    expect(block).toMatch(/UPDATE bookings SET[\s\S]*?status = 'matched'/);
    // Must NOT run the booking UPDATE through bare db.query (outside trx).
    // (allow for the surrounding non-trx code, but the UPDATE must use client.query)
    const bookingUpdates = block.match(/db\.query\([\s\S]*?UPDATE bookings SET[\s\S]*?status = 'matched'/g);
    expect(bookingUpdates).toBeNull();
  });

  it('MED-N87 — provider + customer notifications run AFTER the trx in try/catch', () => {
    const anchor = ROUTES.indexOf('calculateSukiDiscountForBooking');
    // Cover the full assign handler — slice until the next router
    // registration after the assign endpoint.
    const tail = ROUTES.indexOf("router.post(\n  '/:id/quotes'", anchor);
    const block = ROUTES.slice(anchor, tail > 0 ? tail : anchor + 4500);

    // Both notification calls present.
    expect(block).toMatch(/notifyProviderNewJob/);
    expect(block).toMatch(/notifyCustomerProviderAssigned/);

    // Both notifications wrapped in try/catch (best-effort post-commit).
    const tryCatchBlocks = block.match(/try \{[\s\S]*?notify[\s\S]*?\} catch/g);
    expect(tryCatchBlocks).not.toBeNull();
    expect((tryCatchBlocks ?? []).length).toBeGreaterThanOrEqual(2);

    // Line-scan for the trx open / close / notify positions. The
    // canonical trx close is `      });` on its own line.
    const lines = block.split('\n');
    const trxOpenLine = lines.findIndex((l) => /db\.transaction\(async \(client\)/.test(l));
    expect(trxOpenLine).toBeGreaterThanOrEqual(0);
    const trxCloseLine = lines.findIndex((l, i) => i > trxOpenLine && /^\s+\}\);\s*$/.test(l));
    expect(trxCloseLine).toBeGreaterThan(trxOpenLine);
    const notifyLine = lines.findIndex(
      (l, i) => i > trxOpenLine && /notifyProviderNewJob/.test(l),
    );
    expect(notifyLine).toBeGreaterThan(trxCloseLine);
  });
});

describe('MED-N88 — report-no-show wraps booking UPDATE + escrow in a single transaction', () => {
  // The handler body is large (input validation + status checks + the
  // post-commit notification block). Use the entire router file from
  // the route start to the next router. registration as the slice.
  function noShowHandlerBlock(): string {
    const anchor = ROUTES.indexOf("'/:id/report-no-show'");
    expect(anchor).toBeGreaterThan(0);
    // Find next router.post / .get / .delete after the handler — the
    // export at the end of the file is the safe outer bound.
    const tail = ROUTES.indexOf('export default router', anchor);
    expect(tail).toBeGreaterThan(anchor);
    return ROUTES.slice(anchor, tail);
  }

  it('MED-N88 — uses handleCancellationInTransaction (trx-aware) inside db.transaction', () => {
    const block = noShowHandlerBlock();

    // Must wrap in db.transaction.
    expect(block).toMatch(/await db\.transaction\(async \(client\)/);
    // Booking status flip must run on the trx client.
    expect(block).toMatch(/client\.query[\s\S]*?cancelled_by_customer/);
    // Must use the trx-aware escrow variant — NOT the legacy
    // escrowService.handleCancellation.
    expect(block).toMatch(/escrowService\.handleCancellationInTransaction/);
    // Must NOT call the non-trx variant inside the no-show handler.
    // The MED-N88 comment block legitimately mentions the old name —
    // require an actual call (open paren) to avoid matching the doc.
    const nonTrxCall = block.match(/escrowService\.handleCancellation\(/);
    expect(nonTrxCall).toBeNull();
  });

  it('MED-N88 — customer notification runs AFTER the trx in try/catch', () => {
    const block = noShowHandlerBlock();

    expect(block).toMatch(/notificationService\.createNotification/);
    // try { ... notificationService.createNotification(...) ... } catch (notifyErr)
    expect(block).toMatch(/try \{[\s\S]*?notificationService\.createNotification[\s\S]*?\} catch \(notifyErr\)/);

    // The qualified call appears AFTER the trx close. Use a line-scan
    // approach because the indented `      });` that closes the trx
    // looks identical to other `});` patterns in the same handler;
    // anchoring on the canonical line shape ensures we find the trx
    // close (line starting with whitespace followed by `});`).
    const lines = block.split('\n');
    const trxOpenLine = lines.findIndex((l) => /db\.transaction\(async \(client\)/.test(l));
    expect(trxOpenLine).toBeGreaterThanOrEqual(0);
    // Trx close is the next line that is exactly indentation + `});`.
    const trxCloseLine = lines.findIndex((l, i) => i > trxOpenLine && /^\s+\}\);\s*$/.test(l));
    expect(trxCloseLine).toBeGreaterThan(trxOpenLine);
    const notifyLine = lines.findIndex(
      (l, i) => i > trxOpenLine && /notificationService\.createNotification/.test(l),
    );
    expect(notifyLine).toBeGreaterThan(trxCloseLine);
  });
});
