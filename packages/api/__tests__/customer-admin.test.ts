/**
 * Phase 06 — unit tests for customer-admin service.
 *
 * Mirrors the pattern of provider-admin.test.ts. Mocks db.query + db.transaction
 * so each test is hermetic. Covers:
 *   - shape and projection for every read endpoint (profile, bookings,
 *     payments, disputes, referrals, activity)
 *   - 404 paths
 *   - fraud-pattern flag on disputes
 *   - status mutations (suspend / reactivate / flag_fraud) with admin_actions
 *     ledger and validation guards
 *   - wallet credit (sacred): balance update + paired adjustment ledger row +
 *     admin_actions audit + invariants (money conservation; rejects negative
 *     resulting balance; rejects zero/non-integer/empty-reason)
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

// MED-N16 (D-J... v1.1) — customer-admin.service now reads
// fraud-pattern thresholds from platform_settings. Mock the
// settings service so the existing fraud-pattern tests don't hit
// Redis/DB. Return the same defaults the SETTING_DEFAULTS map seeds
// so existing assertions about "5 disputes in 30 days" remain valid.
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: async (key: string) => {
    if (key === 'fraud_pattern_dispute_count_threshold') return 5;
    if (key === 'fraud_pattern_window_days') return 30;
    throw new Error(`unmocked setting: ${key}`);
  },
  getSetting: async (key: string) => {
    if (key === 'fraud_pattern_favor_provider_rate') return '0.80';
    throw new Error(`unmocked setting: ${key}`);
  },
}));

import * as svc from '../src/services/customer-admin.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(
    (cb: (client: { query: (...args: unknown[]) => unknown }) => unknown) =>
      cb({ query: (...args: unknown[]) => dbQueryMock(...args) }),
  );
});

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '33333333-3333-3333-3333-333333333333';

// ─── getCustomerProfile ─────────────────────────────────────────────────────

describe('getCustomerProfile', () => {
  it('returns 404 when customer missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getCustomerProfile(CUSTOMER_ID, 'super_admin')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('projects nested addresses + suki memberships + lifetime stats', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: CUSTOMER_ID,
            first_name: 'Joe',
            last_name: 'Cust',
            phone: '+639170000000',
            email: 'joe@example.com',
            avatar_url: null,
            is_verified: true,
            is_active: true,
            last_login_at: new Date('2024-03-01T00:00:00Z'),
            created_at: new Date('2024-01-01T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            lifetime_bookings: '10',
            lifetime_spent: '500000',
            avg_rating: '4.20',
            total_reviews: '8',
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'addr1',
            label: 'Home',
            full_address: '123 Main St',
            barangay: 'BGC',
            city: 'Taguig',
            province: 'NCR',
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            membership_id: 'sm1',
            provider_id: 'p1',
            business_name: 'Acme Plumbing',
            tier: 'suki',
            total_bookings: 5,
            total_spent: '250000',
            points_balance: 120,
            last_booking_at: new Date('2024-02-15T00:00:00Z'),
          },
        ]),
      );

    const out = await svc.getCustomerProfile(CUSTOMER_ID, 'super_admin');
    expect(out.fullName).toBe('Joe Cust');
    expect(out.lifetimeBookings).toBe(10);
    expect(out.lifetimeSpent).toBe(500000);
    expect(out.averageRatingGiven).toBe(4.2);
    expect(out.totalReviewsGiven).toBe(8);
    expect(out.addresses).toEqual([
      {
        id: 'addr1',
        label: 'Home',
        fullAddress: '123 Main St',
        barangay: 'BGC',
        city: 'Taguig',
        province: 'NCR',
        isDefault: true,
      },
    ]);
    expect(out.sukiProviders[0].providerBusinessName).toBe('Acme Plumbing');
    expect(out.sukiProviders[0].totalSpent).toBe(250000);
  });

  it('handles null avg_rating and empty arrays', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: CUSTOMER_ID,
            first_name: 'Joe',
            last_name: 'Cust',
            phone: '+639170000000',
            email: null,
            avatar_url: null,
            is_verified: false,
            is_active: true,
            last_login_at: null,
            created_at: new Date('2024-01-01T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          { lifetime_bookings: '0', lifetime_spent: '0', avg_rating: null, total_reviews: '0' },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
    const out = await svc.getCustomerProfile(CUSTOMER_ID, 'super_admin');
    expect(out.averageRatingGiven).toBeNull();
    expect(out.lastLoginAt).toBeNull();
    expect(out.addresses).toEqual([]);
    expect(out.sukiProviders).toEqual([]);
  });

  // D25 — PII masking. Reuses the standard projection mock shape.
  function mockProfileQueries(email: string | null = 'joe@example.com') {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: CUSTOMER_ID,
            first_name: 'Joe',
            last_name: 'Cust',
            phone: '+639171234567',
            email,
            avatar_url: null,
            is_verified: true,
            is_active: true,
            last_login_at: null,
            created_at: new Date('2024-01-01T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          { lifetime_bookings: '0', lifetime_spent: '0', avg_rating: null, total_reviews: '0' },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
  }

  it('D25 — super_admin sees raw phone + email (contactMasked false)', async () => {
    mockProfileQueries();
    const out = await svc.getCustomerProfile(CUSTOMER_ID, 'super_admin');
    expect(out.phone).toBe('+639171234567');
    expect(out.email).toBe('joe@example.com');
    expect(out.contactMasked).toBe(false);
  });

  it('D25 — junior admin sees masked phone + email (contactMasked true)', async () => {
    mockProfileQueries();
    const out = await svc.getCustomerProfile(CUSTOMER_ID, 'admin');
    expect(out.phone).not.toBe('+639171234567');
    expect(out.phone).toContain('4567');
    expect(out.email).not.toBe('joe@example.com');
    expect(out.email).toContain('@example.com');
    expect(out.contactMasked).toBe(true);
  });

  it('D25 — masked email stays null when the customer has no email', async () => {
    mockProfileQueries(null);
    const out = await svc.getCustomerProfile(CUSTOMER_ID, 'admin');
    expect(out.email).toBeNull();
    expect(out.contactMasked).toBe(true);
  });
});

// ─── revealCustomerContact ──────────────────────────────────────────────────

describe('revealCustomerContact', () => {
  it('Bug UX-014 — returns contact only through an audit-logged transaction', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ phone: '+639171234567', email: 'joe@example.com' }]))
      .mockResolvedValueOnce(rows([])); // INSERT into admin_actions

    const out = await svc.revealCustomerContact(CUSTOMER_ID, ADMIN_ID);
    expect(out).toEqual({ phone: '+639171234567', email: 'joe@example.com' });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    const insertCall = dbQueryMock.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO admin_actions/);
    expect(insertCall[0]).toMatch(/pii_reveal/);
    expect(insertCall[1][0]).toBe(ADMIN_ID);
    expect(insertCall[1][1]).toBe(CUSTOMER_ID);
  });

  it('returns 404 when customer missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.revealCustomerContact(CUSTOMER_ID, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── getCustomerBookings ────────────────────────────────────────────────────

describe('getCustomerBookings', () => {
  it('clamps page/pageSize and returns rows + total', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '17' }])).mockResolvedValueOnce(
      rows([
        {
          id: 'b1',
          provider_id: 'p1',
          business_name: 'Acme',
          category_name: 'Plumbing',
          status: 'confirmed',
          total_amount: 100000,
          scheduled_at: new Date('2024-01-15T08:00:00Z'),
          completed_at: new Date('2024-01-15T10:00:00Z'),
          rating_given: 4,
          has_dispute: false,
        },
      ]),
    );
    const out = await svc.getCustomerBookings(CUSTOMER_ID, 0, 9999);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(100);
    expect(out.total).toBe(17);
    expect(out.rows[0].providerBusinessName).toBe('Acme');
    expect(out.rows[0].ratingGiven).toBe(4);
  });

  it('applies status filter via $2 placeholder', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '0' }])).mockResolvedValueOnce(rows([]));
    await svc.getCustomerBookings(CUSTOMER_ID, 1, 20, 'confirmed');
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/b\.status = \$2/);
    expect(dbQueryMock.mock.calls[0][1]).toEqual(
      expect.arrayContaining([CUSTOMER_ID, 'confirmed']),
    );
  });

  it('coerces null category to "Uncategorized"', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '1' }])).mockResolvedValueOnce(
      rows([
        {
          id: 'b1',
          provider_id: null,
          business_name: null,
          category_name: null as unknown as string,
          status: 'requested',
          total_amount: 0,
          scheduled_at: new Date('2024-01-01T00:00:00Z'),
          completed_at: null,
          rating_given: null,
          has_dispute: false,
        },
      ]),
    );
    const out = await svc.getCustomerBookings(CUSTOMER_ID, 1, 10);
    expect(out.rows[0].categoryName).toBe('Uncategorized');
    expect(out.rows[0].providerBusinessName).toBeNull();
  });
});

// ─── getCustomerPayments ────────────────────────────────────────────────────

describe('getCustomerPayments', () => {
  it('aggregates wallet, transactions, intents, method counts', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ available: '50000', pending: '0' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'wt1',
            type: 'payment',
            amount: -100000,
            balance_after: 0,
            description: 'pay',
            booking_id: 'b1',
            created_at: new Date('2024-01-15T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'pi1',
            booking_id: 'b1',
            payment_method: 'gcash',
            status: 'succeeded',
            amount: 100000,
            created_at: new Date('2024-01-15T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          { payment_method: 'gcash', count: '5' },
          { payment_method: 'card', count: '2' },
        ]),
      );
    const out = await svc.getCustomerPayments(CUSTOMER_ID);
    expect(out.walletAvailable).toBe(50000);
    expect(out.recentTransactions[0].amount).toBe(-100000);
    expect(out.recentPaymentIntents[0].paymentMethod).toBe('gcash');
    expect(out.paymentMethodCounts).toEqual({ gcash: 5, card: 2 });
  });

  it('returns zeros when no wallet exists', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
    const out = await svc.getCustomerPayments(CUSTOMER_ID);
    expect(out.walletAvailable).toBe(0);
    expect(out.walletPending).toBe(0);
    expect(out.recentTransactions).toEqual([]);
    expect(out.paymentMethodCounts).toEqual({});
  });
});

// ─── getCustomerDisputes (with fraud pattern) ───────────────────────────────

describe('getCustomerDisputes', () => {
  it('projects rows + reports no-flag for sparse history', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'd1',
          booking_id: 'b1',
          business_name: 'Acme',
          type: 'incomplete',
          status: 'resolved',
          resolution_type: 'partial_refund',
          refund_amount: 5000,
          created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      ]),
    );
    const out = await svc.getCustomerDisputes(CUSTOMER_ID);
    expect(out.rows[0].providerBusinessName).toBe('Acme');
    expect(out.rows[0].refundAmount).toBe(5000);
    expect(out.fraudPattern.flagged).toBe(false);
    expect(out.fraudPattern.disputesLast30Days).toBe(1);
  });

  it('flags fraud pattern when 5+ disputes in 30d and ≥80% favor provider', async () => {
    const now = Date.now();
    const recent = (offsetDays: number, resolution: string | null): Record<string, unknown> => ({
      id: 'd' + offsetDays,
      booking_id: 'b' + offsetDays,
      business_name: 'X',
      type: 'no_show',
      status: 'resolved',
      resolution_type: resolution,
      refund_amount: 0,
      created_at: new Date(now - offsetDays * 24 * 60 * 60 * 1000),
    });
    dbQueryMock.mockResolvedValueOnce(
      rows([
        recent(1, 'no_refund'),
        recent(3, 'no_refund'),
        recent(5, 'refund_with_warning'),
        recent(7, 'no_refund'),
        recent(10, 'partial_refund'), // 1 customer-favorable
      ]),
    );
    const out = await svc.getCustomerDisputes(CUSTOMER_ID);
    expect(out.fraudPattern.disputesLast30Days).toBe(5);
    expect(out.fraudPattern.favorProviderRate).toBe(0.8);
    expect(out.fraudPattern.flagged).toBe(true);
    expect(out.fraudPattern.reason).toContain('5 disputes in 30 days');
    expect(out.fraudPattern.reason).toContain('80%');
  });

  it('does not flag when fewer than 5 recent disputes', async () => {
    const now = Date.now();
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'd1',
          booking_id: 'b1',
          business_name: 'X',
          type: 'no_show',
          status: 'resolved',
          resolution_type: 'no_refund',
          refund_amount: 0,
          created_at: new Date(now - 1 * 24 * 60 * 60 * 1000),
        },
      ]),
    );
    const out = await svc.getCustomerDisputes(CUSTOMER_ID);
    expect(out.fraudPattern.flagged).toBe(false);
  });

  it('returns null favor rate when no resolved disputes in window', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    const out = await svc.getCustomerDisputes(CUSTOMER_ID);
    expect(out.fraudPattern.favorProviderRate).toBeNull();
    expect(out.fraudPattern.flagged).toBe(false);
  });
});

// ─── getCustomerReferrals ───────────────────────────────────────────────────

describe('getCustomerReferrals', () => {
  it('aggregates own codes, given, received, and total earned', async () => {
    dbQueryMock
      .mockResolvedValueOnce(
        rows([
          {
            id: 'rc1',
            code: 'JOE10',
            type: 'standard',
            uses_count: 3,
            max_uses: null,
            referrer_bonus: 5000,
            referee_bonus: 5000,
            is_active: true,
            expires_at: null,
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'rd1',
            referee_id: 'u-friend',
            referee_name: 'Friend One',
            referee_bonus: 5000,
            referrer_bonus: 5000,
            referrer_credited: true,
            qualifying_booking_id: 'b9',
            created_at: new Date('2024-02-01T00:00:00Z'),
          },
          {
            id: 'rd2',
            referee_id: 'u-friend2',
            referee_name: 'Friend Two',
            referee_bonus: 5000,
            referrer_bonus: 5000,
            referrer_credited: false, // not credited yet — not counted
            qualifying_booking_id: null,
            created_at: new Date('2024-02-02T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'rd3',
            referrer_id: 'u-other',
            referrer_name: 'Other Person',
            referee_bonus: 5000,
            referee_credited: true,
            created_at: new Date('2023-12-01T00:00:00Z'),
          },
        ]),
      );
    const out = await svc.getCustomerReferrals(CUSTOMER_ID);
    expect(out.ownCodes[0].code).toBe('JOE10');
    expect(out.given).toHaveLength(2);
    expect(out.received?.referrerName).toBe('Other Person');
    expect(out.totalEarnedFromReferrals).toBe(5000); // only the credited one
  });

  it('handles no referrals gracefully', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
    const out = await svc.getCustomerReferrals(CUSTOMER_ID);
    expect(out.ownCodes).toEqual([]);
    expect(out.given).toEqual([]);
    expect(out.received).toBeNull();
    expect(out.totalEarnedFromReferrals).toBe(0);
  });
});

// ─── getCustomerActivity ────────────────────────────────────────────────────

describe('getCustomerActivity', () => {
  it('throws 404 when customer missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getCustomerActivity(CUSTOMER_ID, 50)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('merges audit + login + admin_actions and sorts desc', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ phone: '+639170000000' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'a1',
            action: 'PATCH /customers/x',
            ip_address: '1.2.3.4',
            user_agent: 'UA',
            new_values: { foo: 1 },
            created_at: new Date('2024-02-02T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'l1',
            attempt_type: 'otp_verify',
            success: true,
            ip_address: '5.6.7.8',
            user_agent: 'UA2',
            created_at: new Date('2024-02-04T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([
          {
            id: 'aa1',
            action_type: 'customer_credited',
            reason: 'goodwill',
            details: { delta: 1000 },
            created_at: new Date('2024-02-03T00:00:00Z'),
          },
        ]),
      );
    const out = await svc.getCustomerActivity(CUSTOMER_ID, 50);
    expect(out).toHaveLength(3);
    expect(out[0].source).toBe('login'); // Feb 4 first
    expect(out[1].source).toBe('admin_action'); // Feb 3
    expect(out[2].source).toBe('audit'); // Feb 2
    expect(out[1].detail).toBe('goodwill');
  });

  it('clamps limit to [1,200]', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ phone: '+639170000000' }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));
    await svc.getCustomerActivity(CUSTOMER_ID, 9999);
    // Each of audit/login/admin_action queries received the clamped limit
    expect(dbQueryMock.mock.calls[1][1][1]).toBe(200);
    expect(dbQueryMock.mock.calls[2][1][1]).toBe(200);
    expect(dbQueryMock.mock.calls[3][1][1]).toBe(200);
  });
});

// ─── updateCustomerStatus ───────────────────────────────────────────────────

describe('updateCustomerStatus', () => {
  function setupTransaction(selectRows: { id: string; is_active: boolean }[]): {
    calls: { sql: string; params: unknown[] }[];
  } {
    const calls: { sql: string; params: unknown[] }[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT id, is_active')) return rows(selectRows);
        if (sql.startsWith('UPDATE users')) return { rows: [], rowCount: 1 };
        if (sql.startsWith('INSERT INTO admin_actions')) return rows([]);
        return rows([]);
      });
      return cb({ query: clientQuery as unknown as jest.Mock });
    });
    return { calls };
  }

  it('rejects short reason', async () => {
    await expect(
      svc.updateCustomerStatus(CUSTOMER_ID, 'suspend', 'no', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid action', async () => {
    await expect(
      svc.updateCustomerStatus(
        CUSTOMER_ID,
        'nuke' as unknown as svc.CustomerStatusAction,
        'good reason here',
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404 when customer missing', async () => {
    setupTransaction([]);
    await expect(
      svc.updateCustomerStatus(CUSTOMER_ID, 'suspend', 'good reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('suspends an active customer', async () => {
    const { calls } = setupTransaction([{ id: CUSTOMER_ID, is_active: true }]);
    const out = await svc.updateCustomerStatus(
      CUSTOMER_ID,
      'suspend',
      'fraudulent activity detected',
      ADMIN_ID,
    );
    expect(out.isActive).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('UPDATE users'))).toBe(true);
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO admin_actions'))!;
    expect(insertCall.params[1]).toBe('customer_suspended');
  });

  it('reactivates a suspended customer', async () => {
    const { calls } = setupTransaction([{ id: CUSTOMER_ID, is_active: false }]);
    const out = await svc.updateCustomerStatus(
      CUSTOMER_ID,
      'reactivate',
      'appealed and verified',
      ADMIN_ID,
    );
    expect(out.isActive).toBe(true);
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO admin_actions'))!;
    expect(insertCall.params[1]).toBe('customer_reactivated');
  });

  it('flag_fraud writes admin_actions and sets is_flagged_fraud=TRUE but does NOT change is_active (MED-N15)', async () => {
    const { calls } = setupTransaction([{ id: CUSTOMER_ID, is_active: true }]);
    const out = await svc.updateCustomerStatus(
      CUSTOMER_ID,
      'flag_fraud',
      'suspicious dispute pattern',
      ADMIN_ID,
    );
    expect(out.isActive).toBe(true);
    // The is_active UPDATE must NOT run.
    expect(calls.some((c) => c.sql.startsWith('UPDATE users SET is_active'))).toBe(false);
    // BUT the is_flagged_fraud UPDATE MUST run (MED-N15).
    expect(calls.some((c) => c.sql.startsWith('UPDATE users SET is_flagged_fraud = TRUE'))).toBe(
      true,
    );
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO admin_actions'))!;
    // MED-N15: action_type now correctly recorded; reason no longer needs the prefix.
    expect(insertCall.params[1]).toBe('customer_flagged_fraud');
    expect(String(insertCall.params[4])).not.toContain('[fraud_flag]');
  });

  it('skips UPDATE when suspending an already-suspended customer', async () => {
    const { calls } = setupTransaction([{ id: CUSTOMER_ID, is_active: false }]);
    await svc.updateCustomerStatus(
      CUSTOMER_ID,
      'suspend',
      'still locked from prior issue',
      ADMIN_ID,
    );
    expect(calls.some((c) => c.sql.startsWith('UPDATE users'))).toBe(false);
  });
});

// ─── creditCustomerWallet (SACRED — money movement) ─────────────────────────

describe('creditCustomerWallet', () => {
  function setupTransaction(opts: {
    customerExists: boolean;
    walletRows: { id: string; available_balance: string }[];
    insertWallet?: { id: string; available_balance: string };
    insertTxId: string | null;
  }): { calls: { sql: string; params: unknown[] }[] } {
    const calls: { sql: string; params: unknown[] }[] = [];
    let walletSelectCount = 0;
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("FROM users WHERE id = $1 AND role = 'customer'")) {
          return rows(opts.customerExists ? [{ id: CUSTOMER_ID }] : []);
        }
        if (
          sql.includes('SELECT id, available_balance FROM wallets') &&
          sql.includes("type = 'customer'")
        ) {
          walletSelectCount += 1;
          return rows(opts.walletRows);
        }
        if (sql.startsWith('INSERT INTO wallets')) {
          return rows(opts.insertWallet ? [opts.insertWallet] : []);
        }
        if (sql.includes('SELECT id, available_balance FROM wallets WHERE id = $1 FOR UPDATE')) {
          return rows(opts.insertWallet ? [opts.insertWallet] : []);
        }
        if (sql.startsWith('UPDATE wallets')) return { rows: [], rowCount: 1 };
        if (sql.startsWith('INSERT INTO wallet_transactions')) {
          return rows(opts.insertTxId ? [{ id: opts.insertTxId }] : []);
        }
        if (sql.startsWith('INSERT INTO admin_actions')) return rows([]);
        return rows([]);
      });
      // walletSelectCount referenced to satisfy linter and aid debugging
      void walletSelectCount;
      return cb({ query: clientQuery as unknown as jest.Mock });
    });
    return { calls };
  }

  it.each([
    [0, 'reason ok now'],
    [1.5, 'reason ok now'],
    [Number.NaN, 'reason ok now'],
  ])('rejects invalid amount %p', async (amt) => {
    await expect(
      svc.creditCustomerWallet(CUSTOMER_ID, amt as number, 'reason ok now', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['', '   ', 'tiny'])('rejects bad reason %p', async (r) => {
    await expect(svc.creditCustomerWallet(CUSTOMER_ID, 100, r, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('404 when customer missing', async () => {
    setupTransaction({ customerExists: false, walletRows: [], insertTxId: 'tx1' });
    await expect(
      svc.creditCustomerWallet(CUSTOMER_ID, 100, 'goodwill credit issued', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects when adjustment would make balance negative', async () => {
    setupTransaction({
      customerExists: true,
      walletRows: [{ id: 'w1', available_balance: '50' }],
      insertTxId: 'tx1',
    });
    await expect(
      svc.creditCustomerWallet(CUSTOMER_ID, -100, 'reverse erroneous credit', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('credits existing wallet, writes paired ledger row + admin_actions, conserves money', async () => {
    const { calls } = setupTransaction({
      customerExists: true,
      walletRows: [{ id: 'w1', available_balance: '500' }],
      insertTxId: 'tx-c-1',
    });
    const result = await svc.creditCustomerWallet(
      CUSTOMER_ID,
      250,
      'goodwill for delayed booking',
      ADMIN_ID,
    );
    expect(result).toEqual({
      walletId: 'w1',
      newAvailableBalance: 750,
      transactionId: 'tx-c-1',
    });

    const insertTx = calls.find((c) => c.sql.startsWith('INSERT INTO wallet_transactions'))!;
    const [walletId, amount, description, balanceAfter, refId] = insertTx.params as [
      string,
      number,
      string,
      number,
      string,
    ];
    expect(walletId).toBe('w1');
    expect(amount).toBe(250);
    expect(balanceAfter).toBe(750);
    expect(description).toContain(`[admin:${ADMIN_ID}]`);
    expect(refId).toBe(`admin_credit:${ADMIN_ID}`);

    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE wallets'))!;
    expect(updateCall.params).toEqual([750, 'w1']);

    const adminAction = calls.find((c) => c.sql.startsWith('INSERT INTO admin_actions'))!;
    // The service writes 'customer_credited' as a SQL literal (not a param);
    // params are: [admin_id, target_id, details(json), reason].
    expect(adminAction.sql).toContain("'customer_credited'");
    expect(adminAction.params[0]).toBe(ADMIN_ID);
    expect(adminAction.params[1]).toBe(CUSTOMER_ID);
    expect(adminAction.params[3]).toBe('goodwill for delayed booking');
  });

  it('creates a new wallet when none exists, then credits it', async () => {
    const { calls } = setupTransaction({
      customerExists: true,
      walletRows: [], // no existing wallet
      insertWallet: { id: 'w-new', available_balance: '0' },
      insertTxId: 'tx-c-2',
    });
    const result = await svc.creditCustomerWallet(
      CUSTOMER_ID,
      1000,
      'first-time signup credit',
      ADMIN_ID,
    );
    expect(result.walletId).toBe('w-new');
    expect(result.newAvailableBalance).toBe(1000);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO wallets'))).toBe(true);
  });

  it('debits wallet correctly when delta is negative and remains non-negative', async () => {
    const { calls } = setupTransaction({
      customerExists: true,
      walletRows: [{ id: 'w1', available_balance: '1000' }],
      insertTxId: 'tx-c-3',
    });
    const result = await svc.creditCustomerWallet(
      CUSTOMER_ID,
      -300,
      'reversal of duplicate credit',
      ADMIN_ID,
    );
    expect(result.newAvailableBalance).toBe(700);
    const insertTx = calls.find((c) => c.sql.startsWith('INSERT INTO wallet_transactions'))!;
    const [, amount, , balanceAfter] = insertTx.params as [string, number, string, number];
    expect(amount).toBe(-300);
    expect(balanceAfter).toBe(700);
  });

  it('rolls back via thrown error when ledger insert returns no id', async () => {
    setupTransaction({
      customerExists: true,
      walletRows: [{ id: 'w1', available_balance: '500' }],
      insertTxId: null,
    });
    await expect(
      svc.creditCustomerWallet(CUSTOMER_ID, 100, 'goodwill credit issued', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
