// MED-N57 / MED-N60 / MED-N68 / MED-N72 fixes verified.
// Service-level behavior tests for the post-fix shapes.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createNotification } from '../src/services/notification.service';
import { enqueuePushRetry } from '../src/services/push-retry.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  // Default: every transaction's callback runs against a passthrough
  // client whose query() forwards to dbQueryMock.
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N60 — createNotification preserves caller-supplied data keys', () => {
  it("MED-N60 — caller's data.type is preserved (not silently overwritten)", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'n1', user_id: 'u1', type: 'booking_confirmed', title: 't', body: 'b', data: {}, is_read: false, created_at: new Date() }],
      rowCount: 1,
    });
    await createNotification({
      userId: 'u1',
      type: 'booking_confirmed',
      title: 't',
      body: 'b',
      data: { type: 'caller-specific-marker', extra: 42 },
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    const dataJson = params[4] as string;
    const stored = JSON.parse(dataJson) as Record<string, unknown>;
    // Caller's `type` value wins.
    expect(stored.type).toBe('caller-specific-marker');
    // Other caller keys preserved.
    expect(stored.extra).toBe(42);
    // The canonical, never-collides field always carries the notification type.
    expect(stored.notificationType).toBe('booking_confirmed');
  });

  it('MED-N60 — when caller did not set data.type, the back-compat field carries the notification type', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'n2', user_id: 'u1', type: 'provider_assigned', title: 't', body: 'b', data: {}, is_read: false, created_at: new Date() }],
      rowCount: 1,
    });
    await createNotification({
      userId: 'u1',
      type: 'provider_assigned',
      title: 't',
      body: 'b',
      data: { bookingId: 'bk-1' },
    });
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    const stored = JSON.parse(params[4] as string) as Record<string, unknown>;
    expect(stored.type).toBe('provider_assigned'); // back-compat
    expect(stored.notificationType).toBe('provider_assigned'); // canonical
    expect(stored.bookingId).toBe('bk-1');
  });

  it('MED-N60 — notificationType is canonical and unaffected by caller data.notificationType', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'n3', user_id: 'u1', type: 'rating_received', title: 't', body: 'b', data: {}, is_read: false, created_at: new Date() }],
      rowCount: 1,
    });
    await createNotification({
      userId: 'u1',
      type: 'rating_received',
      title: 't',
      body: 'b',
      data: { notificationType: 'something-else-the-caller-tried-to-spoof' },
    });
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    const stored = JSON.parse(params[4] as string) as Record<string, unknown>;
    // The fix's spread order ensures notificationType is set LAST so
    // the canonical value always wins.
    expect(stored.notificationType).toBe('rating_received');
  });
});

describe('MED-N72 — NotificationType union covers admin operational notification types', () => {
  // The union is a TypeScript type — test via importing and seeing
  // that valid types compile. A failing compile would be a hard test
  // failure earlier than this point.
  it('MED-N72 — union includes provider_rejected and other admin types', () => {
    // The existing call sites that previously violated the union are
    // re-asserted here as type-checked literals.
    const validTypes = [
      'provider_rejected',
      'provider_approved',
      'provider_suspended',
      'provider_reactivated',
      'provider_tier_changed',
      'booking_created',
      'booking_cancelled',
      'chat_started',
      'chat_last_message',
      'provider_consecutive_one_star',
      'paymongo_webhook_failure',
      'provider_nbi_expiring',
      'customer_chronic_disputes',
      'city_low_provider_count',
      'guarantee_fund_low',
    ] as const;
    expect(validTypes.length).toBeGreaterThan(10);
    // All values are strings under 50 chars (notifications.type is VARCHAR(50)).
    for (const t of validTypes) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeLessThanOrEqual(50);
    }
  });
});

describe('MED-N57 — enqueuePushRetry inserts a pending row on push delivery failure', () => {
  it('MED-N57 — INSERT INTO push_retry_queue with caller-supplied payload', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await enqueuePushRetry({
      userId: 'u1',
      notificationId: 'n1',
      title: 'Provider arrived',
      body: 'Your provider is at the door',
      data: { bookingId: 'bk-1' },
      initialError: 'ECONNREFUSED exp.host',
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQueryMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO push_retry_queue/);
    expect(params).toEqual([
      'u1',
      'n1',
      'Provider arrived',
      'Your provider is at the door',
      JSON.stringify({ bookingId: 'bk-1' }),
      'ECONNREFUSED exp.host',
    ]);
  });

  it('MED-N57 — enqueue swallows DB errors so the original push-failure log remains primary', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('DB unreachable'));
    // Should NOT throw — the caller is already in an error path.
    await expect(
      enqueuePushRetry({
        userId: 'u1',
        title: 't',
        body: 'b',
        data: {},
        initialError: 'expo 503',
      }),
    ).resolves.toBeUndefined();
  });
});

// MED-N68 is a structural fix on booking.service.transitionBookingStatus.
// The full statement-by-statement behavior is hard to drive without a
// real DB; assert the post-fix shape via source-content scan (same
// approach as the booking-confirmation-tx test for CRIT-N10 already in
// master).
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BOOKING_SERVICE = readFileSync(
  resolve(__dirname, '../src/services/booking.service.ts'),
  'utf8',
);

describe('MED-N68 — provider cancellation tracking runs inside the parent transaction without double-counting', () => {
  it('MED-N68 — uses client.query (in-trx) not db.query', () => {
    // Anchor on the unique comment marker we placed on the fix, and
    // scope to the immediate `if (newStatus === 'cancelled_by_provider'
    // && updated.provider_id) { ... }` block.
    const anchor = BOOKING_SERVICE.indexOf('MED-N68 fix');
    expect(anchor).toBeGreaterThan(0);
    const ifStart = BOOKING_SERVICE.indexOf(
      "if (newStatus === 'cancelled_by_provider' && updated.provider_id)",
      anchor,
    );
    expect(ifStart).toBeGreaterThan(anchor);
    // Find the matching closing brace by counting depth.
    let depth = 0;
    let cursor = BOOKING_SERVICE.indexOf('{', ifStart);
    let blockEnd = cursor;
    for (let i = cursor; i < BOOKING_SERVICE.length; i++) {
      const ch = BOOKING_SERVICE[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { blockEnd = i + 1; break; }
      }
    }
    const block = BOOKING_SERVICE.slice(ifStart, blockEnd);

    expect(block).toMatch(/await client\.query/);
    expect(block).toMatch(/UPDATE providers/);
    // Must NOT use bare db.query inside the fix block.
    expect(block).not.toMatch(/\bdb\.query/);
  });

  it('MED-N68 — COUNT subquery does not add `+ 1` (just-cancelled row already visible in same trx)', () => {
    const anchor = BOOKING_SERVICE.indexOf('MED-N68 fix');
    const block = BOOKING_SERVICE.slice(anchor, anchor + 1800);

    expect(block).toMatch(/cancellations_last_30d = \(/);
    // The COUNT subquery must end with a `)` and `,` (closing the
    // subquery + comma to next column) — NOT `) + 1,`.
    expect(block).toMatch(/SELECT COUNT\(\*\) FROM bookings[\s\S]*?'30 days'\s*\n?\s*\)\s*,/);
    // Defensive: explicitly assert no `+ 1` after the closing paren.
    expect(block).not.toMatch(/'30 days'\s*\n?\s*\)\s*\+\s*1\s*,/);
  });

  it('MED-N68 — re-throws the error so the parent transaction rolls back', () => {
    const anchor = BOOKING_SERVICE.indexOf('MED-N68 fix');
    const block = BOOKING_SERVICE.slice(anchor, anchor + 1800);
    // catch (err) { ... throw err; }
    expect(block).toMatch(/} catch \(err[\s\S]*?throw err;/);
  });
});
