// MED-N71 / MED-N91 / MED-N113 / MED-N118 fixes verified.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const createNotificationMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createNotificationMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Phase B CRIT-13 fix — calculateServiceFee is now async + reads from
// settings.service. updateRecurringPrice → calculateServiceFee chain
// would otherwise hit Redis with no mock and timeout.
jest.mock('../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0.1),
  getSettingNumber: jest.fn().mockImplementation((key: string) => {
    if (key === 'service_fee_min') return Promise.resolve(2500);
    if (key === 'service_fee_max') return Promise.resolve(50000);
    return Promise.resolve(0);
  }),
}));

import { pricingPreviewSchema } from '../src/validators/booking.validators';
import { approveProvider } from '../src/services/admin.service';
import { updateRecurringPrice } from '../src/services/recurring.service';
import { checkOverdueInvoices } from '../src/services/invoice.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  createNotificationMock.mockReset();
  createNotificationMock.mockResolvedValue(undefined);
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N71 — approveProvider notification type is provider_approved', () => {
  it('MED-N71 — approval writes a provider_approved notification in the approval transaction', async () => {
    const transactionCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
      const client = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
          transactionCalls.push({ sql, params });
          if (/SELECT status, nbi_clearance_url/.test(sql)) {
            return { rows: [{ status: 'pending', nbi_clearance_url: 'onboarding/user-1/nbi.jpg',
              government_id_front_url: 'onboarding/user-1/front.jpg', government_id_back_url: 'onboarding/user-1/back.jpg',
              selfie_url: 'onboarding/user-1/selfie.jpg' }], rowCount: 1 };
          }
          if (/UPDATE providers/.test(sql)) {
            return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        }),
      };
      return (callback as (value: typeof client) => Promise<void>)(client);
    });

    await approveProvider('provider-1', 'admin-1', {
      reason: 'All provider identity and qualification checks passed.',
      checklistConfirmed: true,
      checklistSummary: 'Vetting checklist confirmed (10/10): all required review items passed.',
    });

    const notification = transactionCalls.find((call) => /INSERT INTO notifications/.test(call.sql));
    expect(notification?.sql).toContain("'provider_approved'");
    expect(notification?.sql).not.toContain("'tier_upgrade'");
    expect(notification?.params[0]).toBe('user-1');
  });
});

describe('MED-N91 — pricingPreviewSchema validates POST /bookings/pricing-preview body', () => {
  it('MED-N91 — accepts well-formed input', () => {
    const out = pricingPreviewSchema.safeParse({
      basePrice: 100000,
      scheduledAt: '2026-06-01T10:00:00Z',
      categoryId: 'a1b2c3d4-5678-4abc-9def-0123456789ab',
      city: 'Boracay',
    });
    if (!out.success) {
      // Surface Zod's complaint so the test's failure message is useful.
      // eslint-disable-next-line no-console
      console.error('pricingPreviewSchema rejected well-formed input:', out.error.issues);
    }
    expect(out.success).toBe(true);
  });

  it('MED-N91 — rejects negative basePrice', () => {
    expect(pricingPreviewSchema.safeParse({
      basePrice: -100,
      scheduledAt: '2026-06-01T10:00:00Z',
      categoryId: 'a1b2c3d4-5678-4abc-9def-0123456789ab',
    }).success).toBe(false);
  });

  it('MED-N91 — rejects malformed UUID', () => {
    expect(pricingPreviewSchema.safeParse({
      basePrice: 100000,
      scheduledAt: '2026-06-01T10:00:00Z',
      categoryId: 'not-a-uuid',
    }).success).toBe(false);
  });

  it('MED-N91 — rejects malformed scheduledAt', () => {
    expect(pricingPreviewSchema.safeParse({
      basePrice: 100000,
      scheduledAt: 'tomorrow',
      categoryId: 'a1b2c3d4-5678-4abc-9def-0123456789ab',
    }).success).toBe(false);
  });

  it('MED-N91 — rejects unknown keys via .strict()', () => {
    expect(pricingPreviewSchema.safeParse({
      basePrice: 100000,
      scheduledAt: '2026-06-01T10:00:00Z',
      categoryId: 'a1b2c3d4-5678-4abc-9def-0123456789ab',
      extra: 'bogus',
    }).success).toBe(false);
  });
});

describe('MED-N113 — updateRecurringPrice rejects out-of-range prices', () => {
  it('MED-N113 — rejects negative price (400)', async () => {
    await expect(updateRecurringPrice('rb-1', -100)).rejects.toThrow(/non-negative/);
  });

  it('MED-N113 — rejects price above hard cap', async () => {
    await expect(updateRecurringPrice('rb-1', 99_999_999)).rejects.toThrow(/maximum/);
  });

  it('MED-N113 — rejects price outside subcategory base_price ±50% band', async () => {
    // SELECT recurring_bookings → returns row with subcategory_id.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ customer_id: 'c1', next_booking_date: '2026-06-01', subcategory_id: 'sub-1' }],
      rowCount: 1,
    });
    // SELECT subcategory base_price = 100000 (range allowed: 50000-150000).
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ base_price: 100000 }],
      rowCount: 1,
    });

    // Caller passes 200000 (outside ±50% of 100000).
    await expect(updateRecurringPrice('rb-1', 200000)).rejects.toThrow(/outside the allowed range/);
  });

  it('MED-N113 — accepts price within the ±50% band and writes UPDATE', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ customer_id: 'c1', next_booking_date: '2026-06-01', subcategory_id: 'sub-1' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ base_price: 100000 }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE recurring_bookings

    await updateRecurringPrice('rb-1', 120000);
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE recurring_bookings[\s\S]*?service_price/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
  });
});

describe('MED-N118 — checkOverdueInvoices uses CTE JOIN (no per-row owner lookup)', () => {
  it('MED-N118 — single SQL round-trip; no per-invoice business_accounts SELECT', async () => {
    // SQL returns rows already JOINed with owner_user_id.
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'i1', business_account_id: 'b1', invoice_number: 'INV-001', total_amount: 10000, owner_user_id: 'u1' },
        { id: 'i2', business_account_id: 'b2', invoice_number: 'INV-002', total_amount: 20000, owner_user_id: 'u2' },
      ],
      rowCount: 2,
    });

    const out = await checkOverdueInvoices();
    expect(out).toBe(2);
    // Only ONE db.query call (the CTE).
    const queryCalls = dbQueryMock.mock.calls.filter(([sql]) => /SELECT|UPDATE/.test(sql as string));
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]![0]).toMatch(/WITH updated AS/);
    expect(queryCalls[0]![0]).toMatch(/LEFT JOIN business_accounts/);
    // Notifications sent for each row.
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });

  it('MED-N118 — skips invoices with NULL owner_user_id (defensive)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'i1', business_account_id: 'b1', invoice_number: 'INV-001', total_amount: 10000, owner_user_id: null }],
      rowCount: 1,
    });
    const out = await checkOverdueInvoices();
    expect(out).toBe(1);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});
