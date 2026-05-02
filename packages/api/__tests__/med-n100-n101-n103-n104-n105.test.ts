// MED-N100 / MED-N101 / MED-N103 / MED-N104 / MED-N105 fixes verified.

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
jest.mock('../src/services/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue('{"founding":0.5,"new":0,"verified":0.25,"pro":0.5,"elite":1}'),
}));

import {
  toggleInstantAvailability,
} from '../src/services/provider.service';
import {
  findMatchingProvidersSimple,
  hasBookingConflict,
} from '../src/services/matching.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHECKLIST_SVC = readFileSync(
  resolve(__dirname, '../src/services/checklist.service.ts'),
  'utf8',
);
const MATCHING_SVC = readFileSync(
  resolve(__dirname, '../src/services/matching.service.ts'),
  'utf8',
);
const PROVIDER_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/provider.routes.ts'),
  'utf8',
);
const BOOKING_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N100 — toggleInstantAvailability returns server state via RETURNING', () => {
  it('MED-N100 — service returns the server-computed isAvailable', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ is_available: true }],
      rowCount: 1,
    });
    const out = await toggleInstantAvailability('p1', true);
    expect(out).toEqual({ isAvailable: true });
    const sql = dbQueryMock.mock.calls[0]![0] as string;
    expect(sql).toMatch(/UPDATE providers/);
    expect(sql).toMatch(/RETURNING is_available/);
  });

  it('MED-N100 — throws 404 when provider row not updated', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(toggleInstantAvailability('p-missing', true)).rejects.toThrow(/Provider not found/);
  });

  it('MED-N100 — route uses the service-returned value, not the input', () => {
    expect(PROVIDER_ROUTES).toMatch(/const updated = await providerService\.toggleInstantAvailability/);
    expect(PROVIDER_ROUTES).toMatch(/data: \{ isAvailable: updated\.isAvailable \}/);
  });
});

describe('MED-N101 — checklist booking_checklist_items uses single multi-row INSERT', () => {
  it('MED-N101 — INSERT is one statement with VALUES tuples joined, not a per-row loop', () => {
    // Source-shape test: the INSERT lives inside an `if` block that
    // builds tuples + params arrays, then issues ONE client.query call.
    const insertBlock = CHECKLIST_SVC.match(
      /INSERT INTO booking_checklist_items[\s\S]*?VALUES \$\{tuples\.join\([^)]+\)\}/,
    );
    expect(insertBlock).not.toBeNull();
  });

  it('MED-N101 — INSERT is guarded by `if (items.rows.length > 0)` and the loop only builds tuples + params (no per-row INSERT)', () => {
    expect(CHECKLIST_SVC).toMatch(/if \(items\.rows\.length > 0\)/);
    expect(CHECKLIST_SVC).toMatch(/tuples\.push\(/);
    expect(CHECKLIST_SVC).toMatch(/params\.push\(/);
    // The for-loop body inside the if-block must contain tuples.push
    // and params.push but NOT `await client.query`. Use a focused
    // regex that captures the inner-loop-only body.
    const forMatch = CHECKLIST_SVC.match(
      /for \(const item of items\.rows\) \{\s*\n([\s\S]*?paramIdx \+= 6;\s*\n\s*\})/,
    );
    expect(forMatch).not.toBeNull();
    const forBody = forMatch![1]!;
    expect(forBody).toMatch(/tuples\.push/);
    expect(forBody).toMatch(/params\.push/);
    expect(forBody).not.toMatch(/await client\.query/);
  });
});

describe('MED-N103 — findMatchingProvidersSimple now requires scheduledAt + applies availability filter', () => {
  it('MED-N103 — function signature includes scheduledAt: Date', () => {
    expect(MATCHING_SVC).toMatch(
      /export async function findMatchingProvidersSimple\([\s\S]*?scheduledAt: Date/,
    );
  });

  it('MED-N103 — query includes EXISTS provider_availability filter', () => {
    const fnStart = MATCHING_SVC.indexOf('export async function findMatchingProvidersSimple');
    const fnBlock = MATCHING_SVC.slice(fnStart, fnStart + 4000);
    expect(fnBlock).toMatch(/EXISTS \(\s*SELECT 1 FROM provider_availability pa/);
    expect(fnBlock).toMatch(/pa\.day_of_week = \$4/);
  });

  it('MED-N103 — calling without scheduledAt is a TypeScript error path; runtime accepts a Date', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const out = await findMatchingProvidersSimple(
      'cat-1',
      14.5,
      121.0,
      new Date('2026-06-01T10:00:00+08:00'),
    );
    expect(Array.isArray(out)).toBe(true);
    // Ensure the SQL got the expected param positions: dayOfWeek + timeStr.
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    expect(params[3]).toBeGreaterThanOrEqual(0); // dayOfWeek 0-6
    expect(params[3]).toBeLessThanOrEqual(6);
    expect(typeof params[4]).toBe('string'); // HH:MM:SS
  });

  it('MED-N103 — booking.routes /:id/match passes booking.scheduled_at to the matcher', () => {
    expect(BOOKING_ROUTES).toMatch(
      /findMatchingProvidersSimple\([\s\S]*?new Date\(booking\.scheduled_at\)/,
    );
  });

  it('MED-N103 — booking.routes /:id/match throws 400 when scheduled_at missing', () => {
    expect(BOOKING_ROUTES).toMatch(/Booking must have a scheduled time for matching/);
  });
});

describe('MED-N104 — provider_availability handles overnight schedules', () => {
  it('MED-N104 — findMatchingProviders SQL has the OR (start_time > end_time AND ...) wrap clause', () => {
    expect(MATCHING_SVC).toMatch(
      /pa\.start_time > pa\.end_time[\s\S]*?>= pa\.start_time[\s\S]*?<= pa\.end_time/,
    );
  });

  it('MED-N104 — findMatchingProvidersSimple SQL has the same overnight clause', () => {
    const fnStart = MATCHING_SVC.indexOf('export async function findMatchingProvidersSimple');
    const fnBlock = MATCHING_SVC.slice(fnStart, fnStart + 4000);
    expect(fnBlock).toMatch(
      /pa\.start_time > pa\.end_time[\s\S]*?>= pa\.start_time[\s\S]*?<= pa\.end_time/,
    );
  });
});

describe('MED-N105 — hasBookingConflict uses each existing booking’s actual duration', () => {
  it('MED-N105 — JOINs booking_quotes for estimated_duration_minutes', async () => {
    const fnStart = MATCHING_SVC.indexOf('export async function hasBookingConflict');
    const fnBlock = MATCHING_SVC.slice(fnStart, fnStart + 2000);
    expect(fnBlock).toMatch(/LEFT JOIN booking_quotes bq[\s\S]*?bq\.is_active = TRUE/);
    expect(fnBlock).toMatch(/COALESCE\(bq\.estimated_duration_minutes/);
  });

  it('MED-N105 — uses interval-overlap test (existing.end > new.start AND existing.start < new.end)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await hasBookingConflict('p1', new Date('2026-06-01T12:00:00+08:00'), 60);
    const sql = dbQueryMock.mock.calls[0]![0] as string;
    // existing booking start < new booking end
    expect(sql).toMatch(/b\.scheduled_at < \$3::timestamptz/);
    // existing booking end > new booking start
    expect(sql).toMatch(/b\.scheduled_at \+[\s\S]*?\) > \$2::timestamptz/);
  });

  it('MED-N105 — does NOT use the symmetric ±default-window approach any more', () => {
    const fnStart = MATCHING_SVC.indexOf('export async function hasBookingConflict');
    const fnBlock = MATCHING_SVC.slice(fnStart, fnStart + 2000);
    // Pre-fix used `windowStart = scheduledAt - duration` and
    // `windowEnd = scheduledAt + duration`; post-fix uses newStart and
    // newEnd (forward-only).
    expect(fnBlock).not.toMatch(/scheduledAt\.getTime\(\) - estimatedDurationMinutes/);
  });
});
