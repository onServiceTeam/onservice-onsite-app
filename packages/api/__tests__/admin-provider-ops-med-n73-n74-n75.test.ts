// MED-N73 + MED-N74 + MED-N75 fix verified.
//
// MED-N75: approveProvider now refuses approval if any of nbi_clearance_url,
// government_id_front_url, selfie_url is null on the providers row.
// MED-N74: changeProviderTier now whitelists the 5 valid tiers
// (founding | new | verified | pro | elite) matching the migration 073
// CHECK constraint.
// MED-N73: suspendProvider now flags in-flight bookings with
// provider_suspended_during_booking_at = NOW(); escrow.service
// releaseEscrow + releaseEscrowInTransaction refuse to disburse when
// that flag is non-null.

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
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

import * as adminService from '../src/services/admin.service';
import * as escrowService from '../src/services/escrow.service';

const APPROVAL_REVIEW = {
  reason: 'All provider identity and qualification checks passed.',
  checklistConfirmed: true,
  checklistSummary: 'Vetting checklist confirmed (10/10): all required review items passed.',
};

describe('MED-N75 — approveProvider refuses approval when KYC docs are missing', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
  });

  it('refuses approval when nbi_clearance_url is null', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        nbi_clearance_url: null,
        government_id_front_url: 'https://s3/id-front.png',
        selfie_url: 'https://s3/selfie.png',
      }],
    });
    await expect(adminService.approveProvider('p-1', 'admin-1', APPROVAL_REVIEW))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/missing KYC documents.*nbi_clearance_url/),
      });
    // Transaction must NOT have run.
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('refuses approval when multiple KYC fields are null and lists all of them', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        nbi_clearance_url: null,
        government_id_front_url: null,
        selfie_url: null,
      }],
    });
    await expect(adminService.approveProvider('p-1', 'admin-1', APPROVAL_REVIEW))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('nbi_clearance_url, government_id_front_url, selfie_url'),
      });
  });

  it('proceeds with approval when all 3 KYC fields are present', async () => {
    // KYC SELECT returns all-present.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        nbi_clearance_url: 'https://s3/nbi.pdf',
        government_id_front_url: 'https://s3/id-front.png',
        selfie_url: 'https://s3/selfie.png',
      }],
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string) => {
        if (/UPDATE providers/.test(sql)) return { rows: [{ id: 'p-1', user_id: 'u-1' }], rowCount: 1 };
        return { rows: [{ user_id: 'u-1' }], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await expect(adminService.approveProvider('p-1', 'admin-1', APPROVAL_REVIEW)).resolves.toBeUndefined();
    expect(dbTransactionMock).toHaveBeenCalled();
  });

  it('throws 404 when provider does not exist', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(adminService.approveProvider('does-not-exist', 'admin-1', APPROVAL_REVIEW))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('MED-N74 — changeProviderTier rejects non-whitelisted tier strings', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
  });

  it('rejects an arbitrary tier string with 400 listing allowed values', async () => {
    await expect(
      adminService.changeProviderTier('p-1', 'admin-1', 'platinum', 'sounds fancy'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Invalid tier "platinum".*Allowed.*founding/),
    });
    // Validation runs BEFORE any DB call.
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it.each(['founding', 'new', 'verified', 'pro', 'elite'])(
    'accepts canonical tier %s',
    async (tier) => {
      // SELECT current tier.
      dbQueryMock.mockResolvedValueOnce({ rows: [{ tier: 'new' }] });
      dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
        const clientQuery = jest.fn(async () => ({ rows: [], rowCount: 1 }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (cb as any)({ query: clientQuery });
      });
      await expect(
        adminService.changeProviderTier('p-1', 'admin-1', tier, 'reason'),
      ).resolves.toBeUndefined();
    },
  );

  it('still throws 404 when provider does not exist (whitelist passes but SELECT empty)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      adminService.changeProviderTier('p-1', 'admin-1', 'pro', 'reason'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('MED-N73 — suspendProvider flags in-flight bookings', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
  });

  it('flags in-flight bookings inside the same transaction as the suspension', async () => {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/UPDATE providers/.test(sql)) return { rows: [{ id: 'p-1', user_id: 'u-1' }], rowCount: 1 };
        if (/UPDATE bookings/.test(sql)) return { rows: [{ id: 'b-1' }, { id: 'b-2' }], rowCount: 2 };
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await adminService.suspendProvider('p-1', 'admin-1', 'Documented fraud review finding');

    const flagUpdate = txCalls.find((c) =>
      /UPDATE bookings/.test(c.sql) && /provider_suspended_during_booking_at/.test(c.sql),
    );
    expect(flagUpdate).toBeDefined();
    // Must scope to in-flight statuses only — finished or already-
    // disputed bookings shouldn't get retroactively flagged.
    expect(flagUpdate!.sql).toMatch(/'provider_en_route'/);
    expect(flagUpdate!.sql).toMatch(/'provider_arrived'/);
    expect(flagUpdate!.sql).toMatch(/'in_progress'/);
    expect(flagUpdate!.sql).toMatch(/'completed_by_provider'/);
    // And idempotent — don't re-flag already-flagged rows.
    expect(flagUpdate!.sql).toMatch(/provider_suspended_during_booking_at IS NULL/);
  });
});

describe('MED-N73 — escrow.service refuses to release when the booking flag is set', () => {
  it('blocks both standalone and composed releases before any wallet or terms work', async () => {
    const suspendedBooking = {
      id: 'booking-med-n73',
      customer_id: 'customer-med-n73',
      provider_id: 'provider-med-n73',
      service_price: '10000',
      service_fee: '1000',
      total_amount: '11000',
      status: 'confirmed',
      escrow_status: 'held',
      scheduled_at: new Date(),
      provider_suspended_during_booking_at: new Date(),
    };
    const standaloneClient = {
      query: jest.fn().mockResolvedValue({ rows: [suspendedBooking], rowCount: 1 }),
    };
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => (
      cb as (client: typeof standaloneClient) => Promise<unknown>
    )(standaloneClient));

    await expect(escrowService.releaseEscrow('booking-med-n73')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/provider was suspended/i),
    });
    expect(standaloneClient.query).toHaveBeenCalledTimes(1);
    expect(standaloneClient.query.mock.calls[0]![0]).toContain('provider_suspended_during_booking_at');

    const composedClient = {
      query: jest.fn().mockResolvedValue({ rows: [suspendedBooking], rowCount: 1 }),
    };
    await expect(
      escrowService.releaseEscrowInTransaction(composedClient, 'booking-med-n73'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/provider was suspended/i),
    });
    expect(composedClient.query).toHaveBeenCalledTimes(1);
    expect(composedClient.query.mock.calls[0]![0]).toContain('provider_suspended_during_booking_at');
  });
});
