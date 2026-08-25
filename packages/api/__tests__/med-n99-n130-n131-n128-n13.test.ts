// MED-N99 / MED-N130 / MED-N131 / MED-N128 / MED-N13 fixes verified.
// Mix of validator behavior and real service-level guards for review,
// staff soft-delete, and pagination changes.

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
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn(),
}));

import { availabilityOverrideSchema } from '../src/validators/provider.validators';
import { removeStaffMember } from '../src/services/staff.service';
import { createReview } from '../src/services/review.service';

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

describe('MED-N99 — availabilityOverrideSchema validates POST body', () => {
  it('MED-N99 — accepts a valid future-date override', () => {
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    })();
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: futureDate,
      isAvailable: false,
      reason: 'On vacation',
    });
    expect(out.success).toBe(true);
  });

  it('MED-N99 — rejects malformed overrideDate', () => {
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: 'tomorrow',
      isAvailable: true,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.path.includes('overrideDate'))).toBe(true);
    }
  });

  it('MED-N99 — rejects past overrideDate', () => {
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: '2020-01-01',
      isAvailable: false,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => /past/.test(i.message))).toBe(true);
    }
  });

  it('MED-N99 — rejects endTime <= startTime', () => {
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    })();
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: futureDate,
      isAvailable: true,
      startTime: '14:00',
      endTime: '12:00',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => /endTime/.test(i.message))).toBe(true);
    }
  });

  it('MED-N99 — rejects malformed time format', () => {
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    })();
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: futureDate,
      isAvailable: true,
      startTime: '25:99',
    });
    expect(out.success).toBe(false);
  });

  it('MED-N99 — caps reason at 500 chars', () => {
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    })();
    const out = availabilityOverrideSchema.safeParse({
      overrideDate: futureDate,
      isAvailable: false,
      reason: 'x'.repeat(501),
    });
    expect(out.success).toBe(false);
  });
});

function mockReviewCreation(): void {
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/FROM bookings WHERE id/.test(sql)) {
      return {
        rows: [{
          id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
          status: 'confirmed', performer_staff_id: null,
        }],
        rowCount: 1,
      };
    }
    if (/COUNT\(\*\).*FROM reviews/s.test(sql)) return { rows: [{ count: '0' }], rowCount: 1 };
    if (/INSERT INTO reviews/.test(sql)) return { rows: [{ id: 'review-1' }], rowCount: 1 };
    if (/AVG\(rating\)/.test(sql)) return { rows: [{ avg_rating: '4.00' }], rowCount: 1 };
    if (/UPDATE providers/.test(sql)) return { rows: [], rowCount: 1 };
    if (/SELECT user_id FROM providers/.test(sql)) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected review SQL: ${sql}`);
  });
}

describe('MED-N130 — review.containsFlaggedContent extended', () => {
  it('MED-N130 — review creation flags URLs, profanity, threats, and bare Philippine mobile numbers', async () => {
    const flaggedExamples = [
      'Contact me at https://outside.example',
      'Tangina this was awful',
      'I will kill you',
      'Text 917-123-4567 instead',
    ];

    for (const comment of flaggedExamples) {
      dbQueryMock.mockReset();
      mockReviewCreation();
      await createReview('booking-1', 'customer-1', { rating: 1, comment });
      const insert = dbQueryMock.mock.calls.find(([sql]) => /INSERT INTO reviews/.test(sql as string));
      expect(insert).toBeDefined();
      expect((insert![1] as unknown[])[12]).toBe(false);
      expect((insert![1] as unknown[])[13]).toBe(true);
    }
  });
});

describe('MED-N131 — review.service enforces max comment + privateNote length', () => {
  it('MED-N131 — review creation accepts 1,000 characters and rejects longer public or private text', async () => {
    mockReviewCreation();

    await expect(createReview('booking-1', 'customer-1', {
      rating: 5,
      comment: 'x'.repeat(1001),
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createReview('booking-1', 'customer-1', {
      rating: 5,
      privateNote: 'x'.repeat(1001),
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createReview('booking-1', 'customer-1', {
      rating: 5,
      comment: 'x'.repeat(1000),
      privateNote: 'y'.repeat(1000),
    })).resolves.toMatchObject({ id: 'review-1' });
  });
});

describe('MED-N128 — removeStaffMember soft-deletes + writes audit', () => {
  it('MED-N128 — soft-deletes the row and INSERTs an admin_actions audit', async () => {
    // SELECT FOR UPDATE — staff exists, role is plain admin (not super_admin).
    dbQueryMock.mockResolvedValueOnce({ rows: [{ role_name: 'admin', is_active: true }], rowCount: 1 });
    // UPDATE admin_staff (soft-delete).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT INTO admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await removeStaffMember('staff-1', 'super-1', 'Archive this obsolete staff directory profile.');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(3);

    // The UPDATE must set is_active=FALSE and removed_at.
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE admin_staff/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toMatch(/is_active = FALSE/);
    expect(updateCall![0]).toMatch(/removed_at = NOW/);
    expect(updateCall![0]).toMatch(/removed_by = \$2/);

    // The audit INSERT records action_type='staff_removed' attributed
    // to the actor adminId.
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/staff_removed/);
    expect((auditCall![1] as unknown[])[0]).toBe('super-1');
  });

  it('MED-N128 — refuses to remove the LAST active super_admin', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ role_name: 'super_admin', is_active: true }], rowCount: 1 });
    // count of OTHER active super_admins = 0
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    await expect(removeStaffMember(
      'only-super',
      'only-super',
      'Archive this obsolete staff directory profile.',
    )).rejects.toThrow(/last active super admin/i);

    // No UPDATE / INSERT happened.
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE admin_staff/.test(sql as string),
    );
    expect(updateCall).toBeUndefined();
  });

  it('MED-N128 — is idempotent on already-removed staff', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ role_name: 'admin', is_active: false }],
      rowCount: 1,
    });

    await expect(removeStaffMember(
      'staff-1',
      'super-1',
      'Archive this obsolete staff directory profile.',
    )).resolves.toBeUndefined();

    // Only the SELECT ran. No UPDATE, no INSERT.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });
});

describe('MED-N13 — provider-admin reviews + disputes paginate', () => {
  // The MED-N13 surface is best tested via the existing provider-admin
  // tests we updated; here we just spot-check the paginated shape via
  // a fresh import.
  it('MED-N13 — getProviderReviews accepts page + pageSize and returns paginated shape', async () => {
    // Import inside the it() so the jest.mock above is set.
    const svc = require('../src/services/provider-admin.service');
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '350' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const out = await svc.getProviderReviews('p1', 2, 50);
    expect(out.total).toBe(350);
    expect(out.page).toBe(2);
    expect(out.pageSize).toBe(50);
    // The data SQL must include LIMIT/OFFSET, not the old hardcoded 200.
    const dataCall = dbQueryMock.mock.calls.find(
      ([sql]) => /FROM reviews/.test(sql as string) && /LIMIT \$/.test(sql as string),
    );
    expect(dataCall).toBeDefined();
    expect(dataCall![0]).toMatch(/OFFSET \$/);
  });

  it('MED-N13 — getProviderDisputes accepts page + pageSize and returns paginated shape', async () => {
    const svc = require('../src/services/provider-admin.service');
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '12' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const out = await svc.getProviderDisputes('p1');
    expect(out.total).toBe(12);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(50);
  });

  it('MED-N13 — pageSize is clamped to [1, 200]', async () => {
    const svc = require('../src/services/provider-admin.service');
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const out = await svc.getProviderReviews('p1', 1, 9999);
    // Caller asked for 9999 but service clamps to 200.
    expect(out.pageSize).toBe(200);
  });
});
