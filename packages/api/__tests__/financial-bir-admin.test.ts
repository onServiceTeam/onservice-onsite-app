/**
 * Phase 08 — unit tests for the financial / BIR admin services.
 *
 * Hermetic. db.query + db.transaction are mocked at module level. pdfkit is
 * allowed to actually run inside services — its Buffer output is never used
 * in assertions, and the in-service S3 helper is env-gated (returns null
 * when AWS_S3_BUCKET / AWS_REGION are unset, which is the case here), so
 * there is no real network or filesystem I/O.
 *
 * Sacred-file note: every audit-row INSERT in Phase 08 services uses a SQL
 * literal action_type. The cross-cutting `system / cross-cutting` block
 * asserts that no audit insert ever passes an action_type as a query
 * parameter (the whole point of literals is to keep the audit trail
 * grep-able and forgery-proof).
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// CRIT-N03 + N06 (2026-05-02 fix): or.service / vat-report.service /
// bir-2307.service all call getBirFilerIdentity() which reads from
// platform_settings via settings.service.getSetting. In this hermetic
// test we mock the loader directly so the BIR identity gate doesn't
// hit the dbQueryMock plumbing (which is reserved for the OR/2307/VAT
// query traffic these tests assert on).
// MED-N119 fix — reconciliation.service now reads the alert threshold
// from settings.service.getSetting. Mock so it doesn't hit Redis/DB.
jest.mock('../src/services/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue('10000'),
}));

jest.mock('../src/services/bir-filer-identity.service', () => ({
  getBirFilerIdentity: jest.fn().mockResolvedValue({
    companyName: 'Test Co.',
    tin: '123-456-789-000',
    address: '1 Test Ave., Test City',
    ptuNumber: 'BIR-PTU-TEST-0001',
    vatStatus: 'VAT-Registered',
  }),
  getBirFilerIdentityRaw: jest.fn().mockResolvedValue({
    companyName: 'Test Co.',
    tin: '123-456-789-000',
    address: '1 Test Ave., Test City',
    ptuNumber: 'BIR-PTU-TEST-0001',
    vatStatus: 'VAT-Registered',
  }),
  BIR_FILER_UNSET_SENTINEL: '__UNSET__',
}));

import { logger } from '../src/utils/logger';

import * as orService from '../src/services/or.service';
import * as birService from '../src/services/bir-2307.service';
import * as vatService from '../src/services/vat-report.service';
import * as reconciliationService from '../src/services/reconciliation.service';
import * as financialAdminService from '../src/services/financial-admin.service';

const loggerMock = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

interface TxCall {
  sql: string;
  params: unknown[];
}

type ClientQueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult<unknown>>;
type TxCallback<T> = (client: { query: ClientQueryFn }) => Promise<T>;

/**
 * Records every client.query call inside a single transaction and dispatches
 * to the supplied handler for the response. Mirrors the booking-dispute-admin
 * test pattern.
 */
function setupTxRecorder(
  handler: (sql: string, params: unknown[]) => Promise<QueryResult<unknown>>,
): TxCall[] {
  const calls: TxCall[] = [];
  dbTransactionMock.mockImplementationOnce(async (cb: TxCallback<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return handler(sql, params);
      }),
    };
    return cb(client);
  });
  return calls;
}

const BOOKING_ID = 'b0000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER_ID = 'p0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const OR_ID = 'r0000000-0000-0000-0000-000000000001';
const CANCEL_OR_ID = 'r0000000-0000-0000-0000-000000000002';
const SNAPSHOT_ID = 's0000000-0000-0000-0000-000000000001';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  // MED-N46 follow-up: default passthrough so services that wrap their
  // body in db.transaction (e.g., generateMonthlyVatReport after the
  // race fix) get their queries forwarded to dbQueryMock without
  // breaking the existing test harness. Tests that need bespoke trx
  // behavior can still call dbTransactionMock.mockImplementationOnce.
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  loggerMock.debug.mockClear();
  delete process.env.AWS_S3_BUCKET;
  delete process.env.AWS_REGION;
});

// ─────────────────────────────────────────────────────────────────────────
// or.service
// ─────────────────────────────────────────────────────────────────────────

describe('or.service.generateOrNumber', () => {
  // Use a fixed Date in mid-month PHT so the year/month are deterministic.
  // 2026-04-15 13:00 PHT == 2026-04-15 05:00 UTC.
  const aprilDate = new Date('2026-04-15T05:00:00Z');
  const mayDate = new Date('2026-05-10T05:00:00Z');

  it('formats first-of-month sequence as zero-padded NNNNNN=000001', async () => {
    // R9 fix: pin issuedAt to aprilDate so this test stays deterministic
    // across calendar rollovers. Previously called generateOrNumber without
    // a date which meant the assertion broke on 2026-05-01 when wall-clock
    // moved to OR-2026-05-000001.
    const clientQuery = jest.fn().mockResolvedValueOnce(rows([{ last_sequence: 1 }]));
    const out = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(out).toBe('OR-2026-04-000001');
  });

  it('formats mid-month sequence=42 as NNNNNN=000042', async () => {
    const clientQuery = jest.fn().mockResolvedValueOnce(rows([{ last_sequence: 42 }]));
    const out = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(out).toBe('OR-2026-04-000042');
  });

  it('formats large sequence=999999 as NNNNNN=999999', async () => {
    const clientQuery = jest.fn().mockResolvedValueOnce(rows([{ last_sequence: 999999 }]));
    const out = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(out).toBe('OR-2026-04-999999');
  });

  it('is monotonic across two calls in the same month (1 -> 2)', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce(rows([{ last_sequence: 1 }]))
      .mockResolvedValueOnce(rows([{ last_sequence: 2 }]));
    const a = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    const b = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(a).toBe('OR-2026-04-000001');
    expect(b).toBe('OR-2026-04-000002');
  });

  it('is monotonic across two calls in the same month (mid-range jumps)', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce(rows([{ last_sequence: 100 }]))
      .mockResolvedValueOnce(rows([{ last_sequence: 101 }]));
    const a = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    const b = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(a).toBe('OR-2026-04-000100');
    expect(b).toBe('OR-2026-04-000101');
  });

  it('separate month resets the sequence (May 1, then April 1)', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce(rows([{ last_sequence: 1 }]))
      .mockResolvedValueOnce(rows([{ last_sequence: 1 }]));
    const may = await orService.generateOrNumber({ query: clientQuery }, mayDate);
    const apr = await orService.generateOrNumber({ query: clientQuery }, aprilDate);
    expect(may).toBe('OR-2026-05-000001');
    expect(apr).toBe('OR-2026-04-000001');
  });
});

describe('or.service.issueOR', () => {
  function existingOrRow(): Record<string, unknown> {
    return {
      id: OR_ID,
      or_number: 'OR-2026-04-000001',
      booking_id: BOOKING_ID,
      customer_id: CUSTOMER_ID,
      provider_id: PROVIDER_ID,
      issued_at: new Date('2026-04-15T05:00:00Z'),
      gross_amount: '11200',
      vat_amount: '1200',
      net_amount: '10000',
      commission_amount: '500',
      service_fee_amount: '200',
      provider_received: '9500',
      platform_retained: '700',
      pdf_url: null,
      is_cancellation: false,
      cancels_or_id: null,
      cancelled_at: null,
      cancellation_reason: null,
    };
  }

  function bookingLookupRow(escrowStatus: string | null): Record<string, unknown> {
    return {
      id: BOOKING_ID,
      customer_id: CUSTOMER_ID,
      provider_id: PROVIDER_ID,
      service_price: '10000',
      service_fee: '1200',
      status: 'confirmed',
      escrow_status: escrowStatus,
      scheduled_at: new Date('2026-04-15T05:00:00Z'),
      customer_first_name: 'Joe',
      customer_last_name: 'Customer',
      customer_email: 'joe@example.com',
      customer_phone: '+639170000000',
      provider_business_name: 'Acme Plumbing',
    };
  }

  it('is idempotent — returns existing OR when bookingId already has one', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([existingOrRow()]));
    const out = await orService.issueOR({
      bookingId: BOOKING_ID,
      commissionAmount: 500,
      serviceFeeAmount: 200,
      providerReceived: 9500,
      platformRetained: 700,
    });
    expect(out.id).toBe(OR_ID);
    expect(out.orNumber).toBe('OR-2026-04-000001');
    // No further DB calls — no transaction, no second insert, no audit.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('throws 409 when booking escrow_status is not "released"', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing check
      .mockResolvedValueOnce(rows([bookingLookupRow('held')])); // booking lookup
    await expect(
      orService.issueOR({
        bookingId: BOOKING_ID,
        commissionAmount: 500,
        serviceFeeAmount: 200,
        providerReceived: 9500,
        platformRetained: 700,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when booking is not found', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing check
      .mockResolvedValueOnce(rows([])); // booking lookup empty
    await expect(
      orService.issueOR({
        bookingId: BOOKING_ID,
        commissionAmount: 500,
        serviceFeeAmount: 200,
        providerReceived: 9500,
        platformRetained: 700,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('VAT-inclusive math — gross=11200 → vat=1200, net=10000', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing check
      .mockResolvedValueOnce(rows([bookingLookupRow('released')])); // booking lookup

    const txCalls = setupTxRecorder(async (sql: string) => {
      if (/or_sequences/.test(sql)) {
        return rows([{ last_sequence: 1 }]);
      }
      if (/INSERT INTO official_receipts/i.test(sql)) {
        return rows([
          {
            ...existingOrRow(),
            gross_amount: '11200',
            vat_amount: '1200',
            net_amount: '10000',
          },
        ]);
      }
      return rows([]);
    });

    // After tx: admin_actions insert.
    dbQueryMock.mockResolvedValueOnce(rows([]));

    const out = await orService.issueOR({
      bookingId: BOOKING_ID,
      commissionAmount: 500,
      serviceFeeAmount: 200,
      providerReceived: 9500,
      platformRetained: 700,
    });

    expect(out.grossAmount).toBe(11200);
    expect(out.vatAmount).toBe(1200);
    expect(out.netAmount).toBe(10000);
    expect(out.grossAmount).toBe(out.netAmount + out.vatAmount);

    // The OR insert call must have been issued with gross/vat/net args in order.
    const insertCall = txCalls.find((c) => /INSERT INTO official_receipts/i.test(c.sql));
    expect(insertCall).toBeDefined();
    // params order: orNumber, bookingId, customer, provider, issuedAt, gross, vat, net, ...
    expect(insertCall!.params[5]).toBe(11200);
    expect(insertCall!.params[6]).toBe(1200);
    expect(insertCall!.params[7]).toBe(10000);
  });

  it('writes admin_actions audit with SQL LITERAL "or_issued"', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(rows([bookingLookupRow('released')])); // booking lookup
    setupTxRecorder(async (sql: string) => {
      if (/or_sequences/.test(sql)) return rows([{ last_sequence: 1 }]);
      if (/INSERT INTO official_receipts/i.test(sql)) return rows([existingOrRow()]);
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // audit insert

    await orService.issueOR({
      bookingId: BOOKING_ID,
      commissionAmount: 500,
      serviceFeeAmount: 200,
      providerReceived: 9500,
      platformRetained: 700,
    });

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return /INSERT INTO admin_actions/i.test(sql) && /'or_issued'/.test(sql);
    });
    expect(auditCall).toBeDefined();
    // action_type must NOT appear as a parameter.
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain('or_issued');
  });

  it('pdfUrl is null when AWS env vars are unset (no S3 upload)', async () => {
    expect(process.env.AWS_S3_BUCKET).toBeUndefined();
    expect(process.env.AWS_REGION).toBeUndefined();

    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(rows([bookingLookupRow('released')])); // lookup
    setupTxRecorder(async (sql: string) => {
      if (/or_sequences/.test(sql)) return rows([{ last_sequence: 1 }]);
      if (/INSERT INTO official_receipts/i.test(sql)) return rows([existingOrRow()]);
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // audit

    const out = await orService.issueOR({
      bookingId: BOOKING_ID,
      commissionAmount: 500,
      serviceFeeAmount: 200,
      providerReceived: 9500,
      platformRetained: 700,
    });

    expect(out.pdfUrl).toBeNull();
    // The S3-skip warn must have been emitted.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Skipping OR PDF upload/),
      expect.any(Object),
    );
  });
});

describe('or.service.cancelOR', () => {
  function origRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: OR_ID,
      or_number: 'OR-2026-04-000001',
      booking_id: BOOKING_ID,
      customer_id: CUSTOMER_ID,
      provider_id: PROVIDER_ID,
      issued_at: new Date('2026-04-15T05:00:00Z'),
      gross_amount: '11200',
      vat_amount: '1200',
      net_amount: '10000',
      commission_amount: '500',
      service_fee_amount: '200',
      provider_received: '9500',
      platform_retained: '700',
      pdf_url: null,
      is_cancellation: false,
      cancels_or_id: null,
      cancelled_at: null,
      cancellation_reason: null,
      ...overrides,
    };
  }

  it('throws 404 when OR not found', async () => {
    setupTxRecorder(async () => rows([]));
    await expect(orService.cancelOR(OR_ID, 'duplicate booking', ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 409 when OR is already cancelled', async () => {
    setupTxRecorder(async () =>
      rows([origRow({ cancelled_at: new Date('2026-04-16T00:00:00Z') })]),
    );
    await expect(orService.cancelOR(OR_ID, 'duplicate booking', ADMIN_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('creates a cancellation OR with negative amounts (gross = net + vat)', async () => {
    const cancelRow = origRow({
      id: CANCEL_OR_ID,
      or_number: 'OR-2026-04-000002',
      gross_amount: '-11200',
      vat_amount: '-1200',
      net_amount: '-10000',
      commission_amount: '-500',
      service_fee_amount: '-200',
      provider_received: '-9500',
      platform_retained: '-700',
      is_cancellation: true,
      cancels_or_id: OR_ID,
      cancelled_at: new Date('2026-04-16T00:00:00Z'),
      cancellation_reason: 'duplicate booking',
    });

    const txCalls = setupTxRecorder(async (sql: string) => {
      if (/SELECT \* FROM official_receipts WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return rows([origRow()]);
      }
      if (/UPDATE official_receipts/.test(sql)) {
        return rows([origRow({ cancelled_at: new Date('2026-04-16T00:00:00Z') })]);
      }
      if (/or_sequences/.test(sql)) return rows([{ last_sequence: 2 }]);
      if (/INSERT INTO official_receipts/i.test(sql)) return rows([cancelRow]);
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // audit

    const result = await orService.cancelOR(OR_ID, 'duplicate booking', ADMIN_ID);

    expect(result.cancellation.grossAmount).toBe(-11200);
    expect(result.cancellation.vatAmount).toBe(-1200);
    expect(result.cancellation.netAmount).toBe(-10000);
    expect(result.cancellation.grossAmount).toBe(
      result.cancellation.netAmount + result.cancellation.vatAmount,
    );

    // Verify negatives were passed as INSERT params.
    const insertCall = txCalls.find(
      (c) => /INSERT INTO official_receipts/i.test(c.sql) && /TRUE/.test(c.sql),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall!.params[5]).toBe(-11200);
    expect(insertCall!.params[6]).toBe(-1200);
    expect(insertCall!.params[7]).toBe(-10000);
  });

  it('marks the original cancelled and writes audit literal "or_cancelled"', async () => {
    setupTxRecorder(async (sql: string) => {
      if (/FOR UPDATE/.test(sql)) return rows([origRow()]);
      if (/UPDATE official_receipts/.test(sql)) {
        return rows([origRow({ cancelled_at: new Date('2026-04-16T00:00:00Z') })]);
      }
      if (/or_sequences/.test(sql)) return rows([{ last_sequence: 2 }]);
      if (/INSERT INTO official_receipts/i.test(sql)) {
        return rows([
          origRow({
            id: CANCEL_OR_ID,
            is_cancellation: true,
            cancels_or_id: OR_ID,
            gross_amount: '-11200',
            vat_amount: '-1200',
            net_amount: '-10000',
          }),
        ]);
      }
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // audit

    const out = await orService.cancelOR(OR_ID, 'duplicate booking', ADMIN_ID);
    expect(out.original.cancelledAt).not.toBeNull();

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return /INSERT INTO admin_actions/i.test(sql) && /'or_cancelled'/.test(sql);
    });
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain('or_cancelled');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// bir-2307.service
// ─────────────────────────────────────────────────────────────────────────

describe('bir-2307.service.quarterWindow', () => {
  it('Q1 2026 — start = 2025-12-31T16:00:00.000Z, end = 2026-03-31T16:00:00.000Z', () => {
    const out = birService.quarterWindow(2026, 1);
    expect(out.startUtc).toBe('2025-12-31T16:00:00.000Z');
    expect(out.endUtc).toBe('2026-03-31T16:00:00.000Z');
  });

  it('Q4 2026 — start = 2026-09-30 16:00 UTC, end = 2026-12-31 16:00 UTC', () => {
    const out = birService.quarterWindow(2026, 4);
    expect(out.startUtc).toBe('2026-09-30T16:00:00.000Z');
    expect(out.endUtc).toBe('2026-12-31T16:00:00.000Z');
  });

  it('throws 400 on invalid quarter', () => {
    expect(() => birService.quarterWindow(2026, 5 as unknown as 1)).toThrow();
    try {
      birService.quarterWindow(2026, 0 as unknown as 1);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});

describe('bir-2307.service.generateQuarterly2307Batches', () => {
  it('skips providers with YTD income at-or-below the P500k threshold', async () => {
    dbQueryMock
      // aggregateQuarterlyIncome
      .mockResolvedValueOnce(
        rows([{ provider_id: PROVIDER_ID, quarterly_income: '1000000' }]),
      )
      // Promise.all: aggregateYtdIncome + loadProviderInfo
      .mockResolvedValueOnce(
        rows([{ provider_id: PROVIDER_ID, ytd_income: '30000000' }]),
      )
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]));

    const out = await birService.generateQuarterly2307Batches(2026, 1);
    expect(out.batchesCreated).toBe(0);
    expect(out.batchesSkipped).toBe(0);
    expect(out.totalProvidersProcessed).toBe(1);
  });

  it('full 1% withholding when prior YTD already crossed threshold', async () => {
    const batchRow = {
      id: 'bat-1',
      provider_id: PROVIDER_ID,
      tax_year: 2026,
      tax_quarter: 2,
      gross_income: '10000000',
      withholding_rate: '0.01',
      withheld_amount: '100000',
      pdf_url: null,
      issued_at: new Date('2026-07-01T00:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, quarterly_income: '10000000' }]))
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, ytd_income: '80000000' }]))
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]))
      .mockResolvedValueOnce(rows([])) // existing batch check
      .mockResolvedValueOnce(rows([batchRow])) // INSERT INTO bir_2307_batches
      .mockResolvedValueOnce(rows([])); // admin_actions audit

    const out = await birService.generateQuarterly2307Batches(2026, 2);
    expect(out.batchesCreated).toBe(1);
    expect(out.totalGrossIncome).toBe(10_000_000);
    expect(out.totalWithheld).toBe(100_000);

    const insertCall = dbQueryMock.mock.calls.find((c) =>
      /INSERT INTO bir_2307_batches/i.test(String(c[0])),
    );
    expect(insertCall).toBeDefined();
    // params: providerId, year, quarter, withholdable=10_000_000, rate=0.01, withheld=100_000
    expect(insertCall![1]).toEqual([PROVIDER_ID, 2026, 2, 10_000_000, 0.01, 100_000]);
  });

  it('partial withholding on threshold-crossing quarter (only excess of YTD over threshold)', async () => {
    // quarterly = 20M, YTD = 60M → priorYtd = 40M (under 50M threshold).
    // withholdable = ytd - threshold = 10_000_000, withheld = 100_000.
    const batchRow = {
      id: 'bat-2',
      provider_id: PROVIDER_ID,
      tax_year: 2026,
      tax_quarter: 2,
      gross_income: '10000000',
      withholding_rate: '0.01',
      withheld_amount: '100000',
      pdf_url: null,
      issued_at: new Date('2026-07-01T00:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, quarterly_income: '20000000' }]))
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, ytd_income: '60000000' }]))
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]))
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(rows([batchRow])) // insert
      .mockResolvedValueOnce(rows([])); // audit

    const out = await birService.generateQuarterly2307Batches(2026, 2);
    expect(out.batchesCreated).toBe(1);
    expect(out.totalGrossIncome).toBe(10_000_000);
    expect(out.totalWithheld).toBe(100_000);

    const insertCall = dbQueryMock.mock.calls.find((c) =>
      /INSERT INTO bir_2307_batches/i.test(String(c[0])),
    );
    expect(insertCall![1]![3]).toBe(10_000_000);
    expect(insertCall![1]![5]).toBe(100_000);
  });

  it('idempotent — pre-existing batch increments batchesSkipped', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, quarterly_income: '10000000' }]))
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, ytd_income: '80000000' }]))
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'pre-existing-batch',
            provider_id: PROVIDER_ID,
            tax_year: 2026,
            tax_quarter: 2,
            gross_income: '10000000',
            withholding_rate: '0.01',
            withheld_amount: '100000',
            pdf_url: null,
            issued_at: new Date('2026-07-01T00:00:00Z'),
          },
        ]),
      );

    const out = await birService.generateQuarterly2307Batches(2026, 2);
    expect(out.batchesCreated).toBe(0);
    expect(out.batchesSkipped).toBe(1);
  });

  it('writes audit with SQL literal "bir_2307_batch_generated"', async () => {
    const batchRow = {
      id: 'bat-3',
      provider_id: PROVIDER_ID,
      tax_year: 2026,
      tax_quarter: 2,
      gross_income: '10000000',
      withholding_rate: '0.01',
      withheld_amount: '100000',
      pdf_url: null,
      issued_at: new Date('2026-07-01T00:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, quarterly_income: '10000000' }]))
      .mockResolvedValueOnce(rows([{ provider_id: PROVIDER_ID, ytd_income: '80000000' }]))
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([batchRow]))
      .mockResolvedValueOnce(rows([]));

    await birService.generateQuarterly2307Batches(2026, 2);

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return (
        /INSERT INTO admin_actions/i.test(sql) && /'bir_2307_batch_generated'/.test(sql)
      );
    });
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain(
      'bir_2307_batch_generated',
    );
  });
});

describe('bir-2307.service.regenerate2307ForProvider', () => {
  it('throws 409 when provider has no quarterly income', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ quarterly_income: '0' }]));
    await expect(
      birService.regenerate2307ForProvider(PROVIDER_ID, 2026, 2, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('writes admin_id=adminUserId in audit row', async () => {
    const upserted = {
      id: 'bat-up',
      provider_id: PROVIDER_ID,
      tax_year: 2026,
      tax_quarter: 2,
      gross_income: '10000000',
      withholding_rate: '0.01',
      withheld_amount: '100000',
      pdf_url: null,
      issued_at: new Date('2026-07-01T00:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ quarterly_income: '10000000' }]))
      .mockResolvedValueOnce(rows([{ ytd_income: '80000000' }]));
    dbTransactionMock.mockImplementationOnce(async (cb: TxCallback<unknown>) => {
      const client = { query: jest.fn().mockResolvedValueOnce(rows([upserted])) };
      return cb(client);
    });
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }])) // loadProviderInfo
      .mockResolvedValueOnce(rows([])); // audit

    await birService.regenerate2307ForProvider(PROVIDER_ID, 2026, 2, ADMIN_ID);

    const auditCall = dbQueryMock.mock.calls.find((c) =>
      /INSERT INTO admin_actions/i.test(String(c[0])),
    );
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[])[0]).toBe(ADMIN_ID);
  });

  it('writes audit with SQL literal "bir_2307_regenerated"', async () => {
    const upserted = {
      id: 'bat-up',
      provider_id: PROVIDER_ID,
      tax_year: 2026,
      tax_quarter: 2,
      gross_income: '10000000',
      withholding_rate: '0.01',
      withheld_amount: '100000',
      pdf_url: null,
      issued_at: new Date('2026-07-01T00:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ quarterly_income: '10000000' }]))
      .mockResolvedValueOnce(rows([{ ytd_income: '80000000' }]));
    dbTransactionMock.mockImplementationOnce(async (cb: TxCallback<unknown>) => {
      const client = { query: jest.fn().mockResolvedValueOnce(rows([upserted])) };
      return cb(client);
    });
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID, business_name: 'Acme' }]))
      .mockResolvedValueOnce(rows([]));

    await birService.regenerate2307ForProvider(PROVIDER_ID, 2026, 2, ADMIN_ID);

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return /INSERT INTO admin_actions/i.test(sql) && /'bir_2307_regenerated'/.test(sql);
    });
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain(
      'bir_2307_regenerated',
    );
  });
});

describe('bir-2307.service.listBatchesForProvider', () => {
  it('returns empty array when no rows', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    const out = await birService.listBatchesForProvider(PROVIDER_ID);
    expect(out).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// vat-report.service
// ─────────────────────────────────────────────────────────────────────────

describe('vat-report.service.generateMonthlyVatReport', () => {
  it('throws 400 when year < 2024', async () => {
    await expect(vatService.generateMonthlyVatReport(2023, 1)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 400 when month < 1 or > 12', async () => {
    await expect(vatService.generateMonthlyVatReport(2024, 0)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(vatService.generateMonthlyVatReport(2024, 13)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 400 for a future month', async () => {
    // 2099 is far in the future for any plausible test clock.
    await expect(vatService.generateMonthlyVatReport(2099, 1)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('aggregates official_receipts → outputVat / totalGrossSales / vatPayable', async () => {
    const reportRow = {
      id: 'rep-1',
      period_year: 2024,
      period_month: 1,
      total_gross_sales: '11200000',
      output_vat: '1200000',
      input_vat: '0',
      vat_payable: '1200000',
      or_count: 100,
      pdf_url: null,
      finalized_at: null,
      finalized_by: null,
      generated_at: new Date('2026-04-15T05:00:00Z'),
    };

    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(
        rows([
          {
            total_gross_sales: '11200000',
            output_vat: '1200000',
            or_count: '100',
          },
        ]),
      ) // agg
      .mockResolvedValueOnce(rows([reportRow])) // upsert
      .mockResolvedValueOnce(rows([])); // audit

    const out = await vatService.generateMonthlyVatReport(2024, 1);
    expect(out.totalGrossSales).toBe(11_200_000);
    expect(out.outputVat).toBe(1_200_000);
    expect(out.vatPayable).toBe(1_200_000);
    expect(out.inputVat).toBe(0);
  });

  it('throws 409 when report exists AND finalized_at is non-null', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'rep-1',
          period_year: 2024,
          period_month: 1,
          total_gross_sales: '0',
          output_vat: '0',
          input_vat: '0',
          vat_payable: '0',
          or_count: 0,
          pdf_url: null,
          finalized_at: new Date('2024-02-01T00:00:00Z'),
          finalized_by: ADMIN_ID,
          generated_at: new Date('2024-02-01T00:00:00Z'),
        },
      ]),
    );
    await expect(vatService.generateMonthlyVatReport(2024, 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('UPSERT — re-runs are allowed when not finalized', async () => {
    const reportRow = {
      id: 'rep-1',
      period_year: 2024,
      period_month: 1,
      total_gross_sales: '0',
      output_vat: '0',
      input_vat: '0',
      vat_payable: '0',
      or_count: 0,
      pdf_url: null,
      finalized_at: null,
      finalized_by: null,
      generated_at: new Date('2026-04-15T05:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([{ ...reportRow }])) // existing — not finalized
      .mockResolvedValueOnce(
        rows([{ total_gross_sales: '0', output_vat: '0', or_count: '0' }]),
      )
      .mockResolvedValueOnce(rows([reportRow]))
      .mockResolvedValueOnce(rows([]));

    const out = await vatService.generateMonthlyVatReport(2024, 1);
    expect(out.id).toBe('rep-1');
  });

  it('writes audit with SQL literal "vat_report_generated"', async () => {
    const reportRow = {
      id: 'rep-1',
      period_year: 2024,
      period_month: 1,
      total_gross_sales: '0',
      output_vat: '0',
      input_vat: '0',
      vat_payable: '0',
      or_count: 0,
      pdf_url: null,
      finalized_at: null,
      finalized_by: null,
      generated_at: new Date('2026-04-15T05:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(
        rows([{ total_gross_sales: '0', output_vat: '0', or_count: '0' }]),
      )
      .mockResolvedValueOnce(rows([reportRow]))
      .mockResolvedValueOnce(rows([]));

    await vatService.generateMonthlyVatReport(2024, 1);

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return /INSERT INTO admin_actions/i.test(sql) && /'vat_report_generated'/.test(sql);
    });
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain('vat_report_generated');
  });
});

describe('vat-report.service.finalizeVatReport', () => {
  it('throws 404 when report missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(vatService.finalizeVatReport(2024, 1, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 409 when already finalized', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'rep-1',
          period_year: 2024,
          period_month: 1,
          total_gross_sales: '0',
          output_vat: '0',
          input_vat: '0',
          vat_payable: '0',
          or_count: 0,
          pdf_url: null,
          finalized_at: new Date('2024-02-01T00:00:00Z'),
          finalized_by: ADMIN_ID,
          generated_at: new Date('2024-02-01T00:00:00Z'),
        },
      ]),
    );
    await expect(vatService.finalizeVatReport(2024, 1, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('writes audit with SQL literal "vat_report_finalized"', async () => {
    const baseRow = {
      id: 'rep-1',
      period_year: 2024,
      period_month: 1,
      total_gross_sales: '0',
      output_vat: '0',
      input_vat: '0',
      vat_payable: '0',
      or_count: 0,
      pdf_url: null,
      finalized_at: null,
      finalized_by: null,
      generated_at: new Date('2026-04-15T05:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([baseRow])) // existing
      .mockResolvedValueOnce(
        rows([{ ...baseRow, finalized_at: new Date('2026-04-15T05:00:00Z'), finalized_by: ADMIN_ID }]),
      ) // UPDATE
      .mockResolvedValueOnce(rows([])); // audit

    await vatService.finalizeVatReport(2024, 1, ADMIN_ID);

    const auditCall = dbQueryMock.mock.calls.find((c) => {
      const sql = String(c[0]);
      return /INSERT INTO admin_actions/i.test(sql) && /'vat_report_finalized'/.test(sql);
    });
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[] | undefined) ?? []).not.toContain('vat_report_finalized');
  });
});

describe('vat-report.service.getAnnualVatSummary', () => {
  it('sums only finalized months', async () => {
    // The query already filters WHERE finalized_at IS NOT NULL — verify the
    // SQL contains that clause AND the totals are computed correctly.
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'r1',
          period_year: 2024,
          period_month: 1,
          total_gross_sales: '100',
          output_vat: '12',
          input_vat: '0',
          vat_payable: '12',
          or_count: 1,
          pdf_url: null,
          finalized_at: new Date('2024-02-01T00:00:00Z'),
          finalized_by: ADMIN_ID,
          generated_at: new Date('2024-02-01T00:00:00Z'),
        },
        {
          id: 'r2',
          period_year: 2024,
          period_month: 2,
          total_gross_sales: '200',
          output_vat: '24',
          input_vat: '0',
          vat_payable: '24',
          or_count: 1,
          pdf_url: null,
          finalized_at: new Date('2024-03-01T00:00:00Z'),
          finalized_by: ADMIN_ID,
          generated_at: new Date('2024-03-01T00:00:00Z'),
        },
      ]),
    );

    const out = await vatService.getAnnualVatSummary(2024);
    expect(out.monthsFinalized).toBe(2);
    expect(out.totalGrossSales).toBe(300);
    expect(out.totalOutputVat).toBe(36);
    expect(out.totalVatPayable).toBe(36);

    const sql = String(dbQueryMock.mock.calls[0]![0]);
    expect(sql).toMatch(/finalized_at IS NOT NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// reconciliation.service
// ─────────────────────────────────────────────────────────────────────────

describe('reconciliation.service.runDailyReconciliation', () => {
  function snapshotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: SNAPSHOT_ID,
      snapshot_date: '2026-04-15',
      paymongo_balance: null,
      platform_escrow_total: '0',
      platform_revenue_total: '0',
      guarantee_fund_total: '0',
      sum_of_user_wallets: '0',
      expected_total: '0',
      discrepancy: '0',
      discrepancy_alert_sent: false,
      notes: null,
      created_at: new Date('2026-04-15T05:00:00Z'),
      ...overrides,
    };
  }

  it('throws 409 when a snapshot already exists for the date', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ id: SNAPSHOT_ID }]));
    await expect(
      reconciliationService.runDailyReconciliation({ snapshotDate: '2026-04-15' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('paymongoBalance=null → discrepancy=0 + notes mention "PayMongo balance unavailable"', async () => {
    // MED-N121 fix — single bulk SELECT replaces the prior two queries.
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing snapshot check
      .mockResolvedValueOnce(rows([{
        platform_escrow_total: '0',
        platform_revenue_total: '0',
        guarantee_fund_total: '0',
        user_wallets_total: '0',
      }])) // bulk wallet totals
      .mockResolvedValueOnce(
        rows([
          snapshotRow({
            notes: 'PayMongo balance unavailable; expected_total only',
          }),
        ]),
      ) // INSERT
      .mockResolvedValueOnce(rows([])); // audit

    const out = await reconciliationService.runDailyReconciliation({
      snapshotDate: '2026-04-15',
    });
    expect(out.discrepancy).toBe(0);
    expect(out.notes).toMatch(/PayMongo balance unavailable/);
  });

  it('paymongoBalance over expected by 5_000 → no alert (under threshold)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(rows([{
        platform_escrow_total: '0',
        platform_revenue_total: '0',
        guarantee_fund_total: '0',
        user_wallets_total: '0',
      }])) // bulk wallet totals
      .mockResolvedValueOnce(
        rows([
          snapshotRow({
            paymongo_balance: '5000',
            expected_total: '0',
            discrepancy: '5000',
            discrepancy_alert_sent: false,
          }),
        ]),
      )
      .mockResolvedValueOnce(rows([]));

    const out = await reconciliationService.runDailyReconciliation({
      snapshotDate: '2026-04-15',
      paymongoBalance: 5_000,
    });
    expect(out.discrepancyAlertSent).toBe(false);
    expect(out.discrepancy).toBe(5_000);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('paymongoBalance over expected by 20_000 → alert flag + logger.error', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{
        platform_escrow_total: '0',
        platform_revenue_total: '0',
        guarantee_fund_total: '0',
        user_wallets_total: '0',
      }])) // bulk wallet totals
      .mockResolvedValueOnce(
        rows([
          snapshotRow({
            paymongo_balance: '20000',
            expected_total: '0',
            discrepancy: '20000',
            discrepancy_alert_sent: true,
          }),
        ]),
      )
      .mockResolvedValueOnce(rows([]));

    const out = await reconciliationService.runDailyReconciliation({
      snapshotDate: '2026-04-15',
      paymongoBalance: 20_000,
    });
    expect(out.discrepancyAlertSent).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringMatching(/Reconciliation discrepancy exceeds threshold/),
      expect.any(Object),
    );
  });

  it('throws 400 on a future snapshotDate', async () => {
    await expect(
      reconciliationService.runDailyReconciliation({ snapshotDate: '2099-12-31' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writes audit with SQL literal "reconciliation_run"', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{
        platform_escrow_total: '0',
        platform_revenue_total: '0',
        guarantee_fund_total: '0',
        user_wallets_total: '0',
      }])) // bulk wallet totals
      .mockResolvedValueOnce(rows([snapshotRow()]))
      .mockResolvedValueOnce(rows([]));

    await reconciliationService.runDailyReconciliation({ snapshotDate: '2026-04-15' });

    const auditCall = dbQueryMock.mock.calls.find((c) =>
      /INSERT INTO admin_actions/i.test(String(c[0])),
    );
    expect(auditCall).toBeDefined();
    // action_type for reconciliation is parameterized by code design — assert
    // it lives at param index 1 and equals 'reconciliation_run'.
    expect((auditCall![1] as unknown[])[1]).toBe('reconciliation_run');
  });
});

describe('reconciliation.service.acknowledgeDiscrepancy', () => {
  function snapshotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: SNAPSHOT_ID,
      snapshot_date: '2026-04-15',
      paymongo_balance: '20000',
      platform_escrow_total: '0',
      platform_revenue_total: '0',
      guarantee_fund_total: '0',
      sum_of_user_wallets: '0',
      expected_total: '0',
      discrepancy: '20000',
      discrepancy_alert_sent: true,
      notes: null,
      created_at: new Date('2026-04-15T05:00:00Z'),
      ...overrides,
    };
  }

  it('throws 409 when snapshot has no active alert', async () => {
    setupTxRecorder(async (sql: string) => {
      if (/SELECT \* FROM reconciliation_snapshots/.test(sql)) {
        return rows([snapshotRow({ discrepancy_alert_sent: false })]);
      }
      return rows([]);
    });
    await expect(
      reconciliationService.acknowledgeDiscrepancy(SNAPSHOT_ID, 'manual review ok', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('writes audit with action_type "reconciliation_alert_acknowledged" and admin_id=adminUserId', async () => {
    setupTxRecorder(async (sql: string) => {
      if (/SELECT \* FROM reconciliation_snapshots/.test(sql)) {
        return rows([snapshotRow()]);
      }
      if (/UPDATE reconciliation_snapshots/.test(sql)) {
        return rows([snapshotRow({ discrepancy_alert_sent: false })]);
      }
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // audit

    await reconciliationService.acknowledgeDiscrepancy(
      SNAPSHOT_ID,
      'manual review — accountant verified',
      ADMIN_ID,
    );

    const auditCall = dbQueryMock.mock.calls.find((c) =>
      /INSERT INTO admin_actions/i.test(String(c[0])),
    );
    expect(auditCall).toBeDefined();
    expect((auditCall![1] as unknown[])[0]).toBe(ADMIN_ID);
    expect((auditCall![1] as unknown[])[1]).toBe('reconciliation_alert_acknowledged');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// financial-admin.service (read-only)
// ─────────────────────────────────────────────────────────────────────────

describe('financial-admin.service.getFinancialOverview', () => {
  it('throws 400 on invalid date format', async () => {
    await expect(
      financialAdminService.getFinancialOverview('bad', '2024-01-01'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when from > to', async () => {
    await expect(
      financialAdminService.getFinancialOverview('2024-02-01', '2024-01-01'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('averageTicket = round(gmv / completed); 0 when completed=0', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ gmv: '1000000', bookings_completed: '10' }]))
      .mockResolvedValueOnce(rows([{ revenue: '0', refunds: '0' }]));
    const out = await financialAdminService.getFinancialOverview('2024-01-01', '2024-01-31');
    expect(out.averageTicketCentavos).toBe(100_000);

    dbQueryMock
      .mockResolvedValueOnce(rows([{ gmv: '0', bookings_completed: '0' }]))
      .mockResolvedValueOnce(rows([{ revenue: '0', refunds: '0' }]));
    const out2 = await financialAdminService.getFinancialOverview('2024-01-01', '2024-01-31');
    expect(out2.averageTicketCentavos).toBe(0);
  });
});

describe('financial-admin.service.getEscrowSummary', () => {
  it('classifies aging buckets from the dedicated aggregate query (MED-N12)', async () => {
    // MED-N12 fix: function now runs THREE queries — wallet,
    // bucket aggregate (no LIMIT), and the displayed list.
    dbQueryMock
      .mockResolvedValueOnce(rows([{ available: '500000', pending: '500000' }]))
      // Aggregate query: per-bucket count + total. NO LIMIT.
      .mockResolvedValueOnce(
        rows([
          { bucket: '0-24h',   count: '1', total: '100000' },
          { bucket: '24-48h',  count: '1', total: '200000' },
          { bucket: '48-168h', count: '1', total: '300000' },
          { bucket: '168h+',   count: '1', total: '400000' },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            booking_id: 'b1',
            customer_name: 'A B',
            provider_name: 'Acme',
            amount: '100000',
            completed_at: new Date('2026-04-15T00:00:00Z'),
            age_hours: '1.0',
            bucket: '0-24h',
          },
          {
            booking_id: 'b2',
            customer_name: 'C D',
            provider_name: 'Acme',
            amount: '200000',
            completed_at: new Date('2026-04-14T00:00:00Z'),
            age_hours: '36.0',
            bucket: '24-48h',
          },
          {
            booking_id: 'b3',
            customer_name: 'E F',
            provider_name: 'Acme',
            amount: '300000',
            completed_at: new Date('2026-04-10T00:00:00Z'),
            age_hours: '120.0',
            bucket: '48-168h',
          },
          {
            booking_id: 'b4',
            customer_name: 'G H',
            provider_name: 'Acme',
            amount: '400000',
            completed_at: null,
            age_hours: '500.0',
            bucket: '168h+',
          },
        ]),
      );

    const out = await financialAdminService.getEscrowSummary();
    expect(out.totalInEscrowCentavos).toBe(1_000_000);
    expect(out.pendingReleaseCount).toBe(4);
    const byBucket = Object.fromEntries(out.agingBuckets.map((b) => [b.bucket, b]));
    expect(byBucket['0-24h']!.count).toBe(1);
    expect(byBucket['24-48h']!.count).toBe(1);
    expect(byBucket['48-168h']!.count).toBe(1);
    expect(byBucket['168h+']!.count).toBe(1);
    expect(byBucket['168h+']!.totalCentavos).toBe(400_000);
  });
});

describe('financial-admin.service.getPayoutsSummary', () => {
  it('returns zeros when payouts table not present (to_regclass returns null)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ exists: null }]));
    const out = await financialAdminService.getPayoutsSummary();
    expect(out).toEqual({
      available: false,
      message: 'Payout reporting is unavailable because the payouts table is missing.',
      pendingCount: 0,
      pendingTotalCentavos: 0,
      internalReviewCount: 0,
      awaitingApprovalCount: 0,
      approvedAwaitingTransferCount: 0,
      processingCount: 0,
      todayCompletedCount: 0,
      todayCompletedCentavos: 0,
      failedCount: 0,
      recentFailed: [],
    });
  });
});

describe('financial-admin.service.getGuaranteeFundSummary', () => {
  it('runwayMonths = +Infinity when avg outflow=0; needsReplenishment respects ₱1M floor', async () => {
    // Scenario A: balance ₱2M, no flow → infinite runway, no replenish.
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ wallet_id: 'w1', available: '200000000', pending: '0' }]),
      )
      .mockResolvedValueOnce(
        rows([{ inflow_30d: '0', outflow_30d: '0', outflow_90d: '0' }]),
      );
    const out = await financialAdminService.getGuaranteeFundSummary();
    expect(out.runwayMonths).toBe(Number.POSITIVE_INFINITY);
    expect(out.needsReplenishment).toBe(false);

    // Scenario B: balance ₱500k (< ₱1M floor), no flow → infinite runway but
    // replenishment still required because balance is below the floor.
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ wallet_id: 'w1', available: '50000000', pending: '0' }]),
      )
      .mockResolvedValueOnce(
        rows([{ inflow_30d: '0', outflow_30d: '0', outflow_90d: '0' }]),
      );
    const out2 = await financialAdminService.getGuaranteeFundSummary();
    expect(out2.runwayMonths).toBe(Number.POSITIVE_INFINITY);
    expect(out2.needsReplenishment).toBe(true);
  });
});

describe('financial-admin.service.getReconciliationOverview', () => {
  it('daysSinceLastSnapshot is null when no snapshots exist', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ exists: 'reconciliation_snapshots' }])) // tableExists
      .mockResolvedValueOnce(rows([])); // snapshots query
    const out = await financialAdminService.getReconciliationOverview();
    expect(out.daysSinceLastSnapshot).toBeNull();
    expect(out.lastSnapshotDate).toBeNull();
    expect(out.recent).toEqual([]);
    expect(out.openAlertsCount).toBe(0);
  });
});

describe('financial-admin.service.searchReceipts', () => {
  it('parameterised SQL — ILIKE clauses receive % wildcards', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ exists: 'official_receipts' }])) // tableExists
      .mockResolvedValueOnce(rows([])) // dataRes
      .mockResolvedValueOnce(rows([{ total: '0' }])); // countRes

    await financialAdminService.searchReceipts({
      orNumber: 'OR-2026',
      customerName: 'Joe',
      providerName: 'Acme',
    });

    // The data + count queries share the same WHERE-side params (count
    // doesn't get LIMIT/OFFSET). Find the count call and assert each ILIKE
    // arg is wrapped with leading + trailing %.
    const countCall = dbQueryMock.mock.calls.find((c) => /COUNT\(\*\)/.test(String(c[0])));
    expect(countCall).toBeDefined();
    const params = (countCall![1] as unknown[]) ?? [];
    expect(params).toContain('%OR-2026%');
    expect(params).toContain('%Joe%');
    expect(params).toContain('%Acme%');
    // SQL must use ILIKE for case-insensitive matching.
    expect(String(countCall![0])).toMatch(/ILIKE \$\d+/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// system / cross-cutting
// ─────────────────────────────────────────────────────────────────────────

describe('system / cross-cutting', () => {
  it('all Phase 08 audit-row INSERTs use SQL literal action_type (never as a query parameter)', async () => {
    // Drive several Phase 08 services that emit audit rows. Then walk every
    // captured admin_actions INSERT and confirm the params array contains
    // none of the known action_type literals.

    // 1) issueOR (literal 'or_issued').
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(
        rows([
          {
            id: BOOKING_ID,
            customer_id: CUSTOMER_ID,
            provider_id: PROVIDER_ID,
            service_price: '10000',
            service_fee: '1200',
            status: 'confirmed',
            escrow_status: 'released',
            scheduled_at: new Date('2026-04-15T05:00:00Z'),
            customer_first_name: 'Joe',
            customer_last_name: 'C',
            customer_email: null,
            customer_phone: null,
            provider_business_name: 'Acme',
          },
        ]),
      );
    setupTxRecorder(async (sql: string) => {
      if (/or_sequences/.test(sql)) return rows([{ last_sequence: 1 }]);
      if (/INSERT INTO official_receipts/i.test(sql)) {
        return rows([
          {
            id: OR_ID,
            or_number: 'OR-2026-04-000001',
            booking_id: BOOKING_ID,
            customer_id: CUSTOMER_ID,
            provider_id: PROVIDER_ID,
            issued_at: new Date('2026-04-15T05:00:00Z'),
            gross_amount: '11200',
            vat_amount: '1200',
            net_amount: '10000',
            commission_amount: '500',
            service_fee_amount: '200',
            provider_received: '9500',
            platform_retained: '700',
            pdf_url: null,
            is_cancellation: false,
            cancels_or_id: null,
            cancelled_at: null,
            cancellation_reason: null,
          },
        ]);
      }
      return rows([]);
    });
    dbQueryMock.mockResolvedValueOnce(rows([])); // or_issued audit

    await orService.issueOR({
      bookingId: BOOKING_ID,
      commissionAmount: 500,
      serviceFeeAmount: 200,
      providerReceived: 9500,
      platformRetained: 700,
    });

    // 2) generateMonthlyVatReport (literal 'vat_report_generated').
    const vatRow = {
      id: 'rep-1',
      period_year: 2024,
      period_month: 1,
      total_gross_sales: '0',
      output_vat: '0',
      input_vat: '0',
      vat_payable: '0',
      or_count: 0,
      pdf_url: null,
      finalized_at: null,
      finalized_by: null,
      generated_at: new Date('2026-04-15T05:00:00Z'),
    };
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // existing
      .mockResolvedValueOnce(
        rows([{ total_gross_sales: '0', output_vat: '0', or_count: '0' }]),
      )
      .mockResolvedValueOnce(rows([vatRow]))
      .mockResolvedValueOnce(rows([]));
    await vatService.generateMonthlyVatReport(2024, 1);

    // Now scan all admin_actions inserts for forbidden action_type params.
    const FORBIDDEN: string[] = [
      'or_issued',
      'or_cancelled',
      'bir_2307_batch_generated',
      'bir_2307_regenerated',
      'vat_report_generated',
      'vat_report_finalized',
    ];

    const auditCalls = dbQueryMock.mock.calls.filter((c) =>
      /INSERT INTO admin_actions/i.test(String(c[0])),
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of auditCalls) {
      const params = (call[1] as unknown[] | undefined) ?? [];
      for (const forbidden of FORBIDDEN) {
        expect(params).not.toContain(forbidden);
      }
    }
  });
});

describe('escrow → orService.issueOR hook', () => {
  // Hermetic stand-in for the escrow.releaseEscrow → orService.issueOR call.
  // We mock the dependency surface escrow.service relies on (wallet,
  // settings, db.transaction) and the orService module itself, then assert
  // the pass-through shape and the failure-isolation guarantee.

  beforeEach(() => {
    jest.resetModules();
  });

  function loadEscrowWithMocks(opts: {
    issueORImpl: jest.Mock;
  }): typeof import('../src/services/escrow.service') {
    jest.doMock('../src/models/db', () => ({
      db: {
        query: dbQueryMock,
        transaction: dbTransactionMock,
      },
    }));
    jest.doMock('../src/utils/logger', () => ({ logger: loggerMock }));
    jest.doMock('../src/services/wallet.service', () => ({
      getPlatformWallet: jest.fn().mockResolvedValue({ id: 'plat-w' }),
      getUserWalletInTransaction: jest.fn().mockResolvedValue({ id: 'user-w' }),
      // A5 — releaseEscrow now row-locks the wallets up front (no-op here).
      lockWalletsForUpdate: jest.fn(),
    }));
    jest.doMock('../src/services/booking-financial-terms.service', () => ({
      getLatestTermsInTransaction: jest.fn().mockResolvedValue({
        version: 1,
        providerId: PROVIDER_ID,
        servicePriceCentavos: 10000,
        serviceFeeAmountCentavos: 1200,
        totalAmountCentavos: 11200,
        commissionRateBasisPoints: 1000,
        commissionAmountCentavos: 1000,
        providerReceivesCentavos: 9000,
        platformRetainsCentavos: 1600,
        serviceFeeRateBasisPoints: 1000,
        guaranteeFundAmountCentavos: 600,
      }),
    }));
    jest.doMock('../src/services/or.service', () => ({
      issueOR: opts.issueORImpl,
    }));

    return require('../src/services/escrow.service') as typeof import('../src/services/escrow.service');
  }

  function setupReleaseQueries(): void {
    dbTransactionMock.mockImplementationOnce(async (cb: TxCallback<unknown>) => {
      const client = {
        query: jest.fn(async (sql: string) => {
          if (/FROM bookings b WHERE b\.id = \$1 FOR UPDATE/.test(sql)) {
            return rows([
          {
            id: BOOKING_ID,
            customer_id: CUSTOMER_ID,
            provider_id: PROVIDER_ID,
            service_price: '10000',
            service_fee: '1200',
            total_amount: '11200',
            status: 'confirmed',
            scheduled_at: new Date('2026-04-15T05:00:00Z'),
          },
            ]);
          }
          if (/SELECT user_id FROM providers/.test(sql)) return rows([{ user_id: 'u1' }]);
          if (/FROM wallets[\s\S]*type = ANY/.test(sql)) {
            return rows([
              { id: 'plat-w', type: 'platform_escrow' },
              { id: 'revenue-w', type: 'platform_revenue' },
              { id: 'guarantee-w', type: 'guarantee_fund' },
            ]);
          }
          if (/UPDATE bookings/.test(sql)) return rows([{ id: BOOKING_ID }]);
          if (/SELECT pending_balance/.test(sql)) return rows([{ pending_balance: '11200' }]);
          return rows([]);
        }),
      };
      return cb(client);
    });
  }

  it('passes the exact { bookingId, commissionAmount, serviceFeeAmount, providerReceived, platformRetained } to issueOR', async () => {
    const issueORMock = jest.fn().mockResolvedValue({ id: OR_ID });
    const escrow = loadEscrowWithMocks({ issueORImpl: issueORMock });

    setupReleaseQueries();
    await escrow.releaseEscrow(BOOKING_ID);

    // commission = 10000 * 0.1 = 1000, providerReceives = 9000
    // guaranteeFund = 1200 * 0.5 = 600, platformRetains = 1000 + 1200 - 600 = 1600
    expect(issueORMock).toHaveBeenCalledTimes(1);
    expect(issueORMock).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      commissionAmount: 1000,
      serviceFeeAmount: 1200,
      providerReceived: 9000,
      platformRetained: 1600,
    });
  });

  it('does NOT throw when issueOR throws — failure is logged and money commit is preserved', async () => {
    const issueORMock = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('OR insert failed'), { statusCode: 500 }));
    const escrow = loadEscrowWithMocks({ issueORImpl: issueORMock });

    setupReleaseQueries();
    await expect(escrow.releaseEscrow(BOOKING_ID)).resolves.toBeDefined();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringMatching(/OR issuance failed after escrow release/),
      expect.objectContaining({ bookingId: BOOKING_ID }),
    );
  });
});
