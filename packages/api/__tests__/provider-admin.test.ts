/**
 * Phase 05 — unit tests for provider-admin service.
 *
 * The service is mostly read-only joins + a single money-moving operation
 * (`adjustProviderWallet`). We mock `db.query` and `db.transaction` so each
 * test is hermetic. Tests cover:
 *   - shape and projection for every read endpoint
 *   - 404 paths
 *   - notes auth/ownership (author vs super_admin)
 *   - validation guards (category, body, profile fields)
 *   - wallet adjustment: balance update + paired ledger row + invariants
 *     (money conservation: balance_after == prev + delta; rejects negative
 *     resulting balance; rejects zero/non-integer amounts; rejects empty reason)
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import * as svc from '../src/services/provider-admin.service';

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

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '33333333-3333-3333-3333-333333333333';
const NOTE_ID = '44444444-4444-4444-4444-444444444444';

// ─── isNoteCategory ─────────────────────────────────────────────────────────

describe('isNoteCategory', () => {
  it.each(['general', 'quality', 'financial', 'legal'])('accepts %s', (v) => {
    expect(svc.isNoteCategory(v)).toBe(true);
  });
  it.each(['', 'other', null, undefined, 7, {}])('rejects %p', (v) => {
    expect(svc.isNoteCategory(v)).toBe(false);
  });
});

// ─── getProviderProfile ─────────────────────────────────────────────────────

describe('getProviderProfile', () => {
  it('returns 404 when provider missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getProviderProfile(PROVIDER_ID, 'super_admin')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // A representative provider row, reused across the projection + masking tests.
  function providerRow() {
    return {
      id: PROVIDER_ID,
      user_id: USER_ID,
      business_name: 'Acme',
      description: 'desc',
      tier: 'pro',
      status: 'approved',
      nbi_clearance_url: 'https://x/y.pdf',
      nbi_expiry_date: new Date('2030-01-01T00:00:00Z'),
      nbi_expiry_notified: false,
      service_radius_km: 12,
      rating: '4.50',
      total_reviews: 10,
      total_jobs: 30,
      latitude: '14.5',
      longitude: '120.9',
      city: 'Manila',
      province: 'NCR',
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-02-01T00:00:00Z'),
      u_id: USER_ID,
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+639171234567',
      email: 'jane@example.com',
      avatar_url: 'https://x/a.png',
      is_verified: true,
      is_active: true,
      last_login_at: new Date('2024-03-01T00:00:00Z'),
    };
  }

  function mockProfileQueries() {
    dbQueryMock
      .mockResolvedValueOnce(rows([providerRow()]))
      .mockResolvedValueOnce(rows([{
        id: 's1', name: 'Pipe repair', category_id: 'c1', category_name: 'Plumbing', pricing_type: 'fixed',
        catalog_base_price: 50000, legacy_provider_base_price: 90000,
        hourly_rate: null, unit_label: null, unit_price: null, min_price: null, max_price: null,
      }]))
      .mockResolvedValueOnce(rows([{ id: 'a1', name: 'Makati', is_primary: true }]))
      .mockResolvedValueOnce(rows([{
        id: 'cert-1', provider_id: PROVIDER_ID, name: 'NC II', issuing_body: 'TESDA',
        certificate_number: 'TESDA-42', certificate_url: 'https://x/onboarding/cert.jpg',
        issued_date: '2025-01-02', expiry_date: '2030-01-02', is_verified: true,
        verified_at: new Date('2026-01-01T00:00:00Z'), created_at: new Date('2025-01-02T00:00:00Z'),
      }]))
      .mockResolvedValueOnce(rows([{
        id: 'portfolio-1',
        image_url: 'https://cdn.example/portfolio/user-1/work.jpg',
        caption: 'Completed work',
        customer_consent_confirmed_at: new Date('2026-08-24T08:00:00Z'),
        created_at: new Date('2026-08-24T08:00:00Z'),
      }]));
  }

  it('joins user row and projects nested shape', async () => {
    mockProfileQueries();

    const out = await svc.getProviderProfile(PROVIDER_ID, 'super_admin');
    expect(out.businessName).toBe('Acme');
    expect(out.user.fullName).toBe('Jane Doe');
    expect(out.documents.governmentIdUrl).toBeNull();
    expect(out.documents.selfieUrl).toBeNull();
    expect(out.categories).toEqual([{ id: 'c1', name: 'Plumbing', basePrice: 50000 }]);
    expect(out.services).toEqual([{
      id: 's1', name: 'Pipe repair', categoryName: 'Plumbing', pricingType: 'fixed',
      basePrice: 50000, hourlyRate: null, unitLabel: null, unitPrice: null,
      minPrice: null, maxPrice: null,
    }]);
    expect(out.serviceAreas).toEqual([{ id: 'a1', name: 'Makati', isPrimary: true }]);
    expect(out.certifications[0]).toMatchObject({
      id: 'cert-1',
      issuedDate: '2025-01-02',
      expiryDate: '2030-01-02',
      isVerified: true,
      hasDocument: true,
      documentUrl: `/api/v1/admin/providers/${PROVIDER_ID}/certifications/cert-1/document`,
    });
    expect(out.portfolio[0]).toMatchObject({
      id: 'portfolio-1',
      caption: 'Completed work',
      customerConsentConfirmedAt: '2026-08-24T08:00:00.000Z',
    });
    expect(out.averageRating).toBe(4.5);
    expect(out.latitude).toBe(14.5);
  });

  it('Bug OPS-219 — Provider 360 returns the booking catalog price, not the dormant provider override', async () => {
    mockProfileQueries();

    const out = await svc.getProviderProfile(PROVIDER_ID, 'super_admin');

    expect(out.services[0]?.basePrice).toBe(50000);
    expect(out.services[0]?.basePrice).not.toBe(90000);
  });

  it('D25 — super_admin sees raw phone + email (contactMasked false)', async () => {
    mockProfileQueries();
    const out = await svc.getProviderProfile(PROVIDER_ID, 'super_admin');
    expect(out.user.phone).toBe('+639171234567');
    expect(out.user.email).toBe('jane@example.com');
    expect(out.user.contactMasked).toBe(false);
  });

  it('D25 — junior admin sees masked phone + email (contactMasked true)', async () => {
    mockProfileQueries();
    const out = await svc.getProviderProfile(PROVIDER_ID, 'admin');
    // Masked phone keeps only the last 4 digits; masked email hides the local part.
    expect(out.user.phone).not.toBe('+639171234567');
    expect(out.user.phone).toContain('4567');
    expect(out.user.email).not.toBe('jane@example.com');
    expect(out.user.email).toContain('@example.com');
    expect(out.user.contactMasked).toBe(true);
  });
});

// ─── revealProviderContact ──────────────────────────────────────────────────

describe('revealProviderContact', () => {
  it('Bug UX-015 — returns contact only through an audit-logged transaction', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ phone: '+639171234567', email: 'jane@example.com' }]))
      .mockResolvedValueOnce(rows([])); // the INSERT into admin_actions

    const out = await svc.revealProviderContact(PROVIDER_ID, ADMIN_ID);
    expect(out).toEqual({ phone: '+639171234567', email: 'jane@example.com' });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // Second call is the audit insert with action_type 'pii_reveal'.
    const insertCall = dbQueryMock.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO admin_actions/);
    expect(insertCall[0]).toMatch(/pii_reveal/);
    expect(insertCall[1][0]).toBe(ADMIN_ID);
    expect(insertCall[1][1]).toBe(PROVIDER_ID);
  });

  it('returns 404 when provider missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.revealProviderContact(PROVIDER_ID, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── getProviderJobs ────────────────────────────────────────────────────────

describe('getProviderJobs', () => {
  it('clamps page/pageSize and returns total + rows', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '42' }])).mockResolvedValueOnce(
      rows([
        {
          id: 'b1',
          customer_id: 'c1',
          customer_name: 'Joe Cust',
          category_name: 'Plumbing',
          status: 'completed',
          total_amount: 100000,
          service_fee: 12000,
          scheduled_at: new Date('2024-01-15T08:00:00Z'),
          completed_at: new Date('2024-01-15T10:00:00Z'),
          rating: 5,
          has_dispute: false,
          dispute_id: null,
        },
      ]),
    );

    const out = await svc.getProviderJobs(PROVIDER_ID, 0, 999);
    expect(out.total).toBe(42);
    expect(out.page).toBe(1); // clamped from 0
    expect(out.pageSize).toBe(100); // clamped from 999
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].customerName).toBe('Joe Cust');
    expect(out.rows[0].hasDispute).toBe(false);
  });

  it('applies status filter', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '0' }])).mockResolvedValueOnce(rows([]));
    await svc.getProviderJobs(PROVIDER_ID, 1, 20, 'completed');
    // params array is reused/mutated across the two queries inside the service;
    // assert the COUNT SQL placeholdered the status filter and used both keys.
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/COUNT\(\*\)/);
    expect(countSql).toMatch(/b\.status = \$2/);
    expect(dbQueryMock.mock.calls[0][1]).toEqual(
      expect.arrayContaining([PROVIDER_ID, 'completed']),
    );
  });
});

// ─── getProviderFinancials ──────────────────────────────────────────────────

describe('getProviderFinancials', () => {
  it('aggregates totals and projects payouts', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ earned: '500000', commission: '50000' }]))
      .mockResolvedValueOnce(rows([{ available: '450000', pending: '10000' }]))
      .mockResolvedValueOnce(rows([{ month: '2024-01', amount: '200000' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'po1',
            amount: 100000,
            method: 'gcash',
            status: 'completed',
            created_at: new Date('2024-01-20T00:00:00Z'),
            completed_at: new Date('2024-01-21T00:00:00Z'),
          },
        ]),
      );

    const out = await svc.getProviderFinancials(PROVIDER_ID);
    expect(out.totalEarned).toBe(500000);
    expect(out.totalCommissionPaid).toBe(50000);
    expect(out.walletAvailable).toBe(450000);
    expect(out.walletPending).toBe(10000);
    expect(out.monthlyEarnings).toEqual([{ month: '2024-01', amount: 200000 }]);
    expect(out.recentPayouts[0].amount).toBe(100000);
  });
});

// ─── getProviderReviews + mutations ─────────────────────────────────────────

describe('getProviderReviews + mutations', () => {
  it('returns reviews with image_urls (now paginated — MED-N13)', async () => {
    // Service now does Promise.all([COUNT, data]) so the mocks must
    // satisfy two queries.
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '1' }])).mockResolvedValueOnce(
      rows([
        {
          id: 'r1',
          booking_id: 'b1',
          reviewer_id: 'c1',
          reviewer_name: 'Joe Cust',
          rating: 4,
          comment: 'good',
          is_visible: true,
          admin_response: null,
          image_urls: ['https://x/1.png'],
          created_at: new Date('2024-02-01T00:00:00Z'),
        },
      ]),
    );
    const out = await svc.getProviderReviews(PROVIDER_ID);
    expect(out.rows[0].rating).toBe(4);
    expect(out.rows[0].imageUrls).toEqual(['https://x/1.png']);
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(50);
  });

  it('setReviewVisibility throws 404 when missing', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      svc.setReviewVisibility(PROVIDER_ID, 'rX', false, 'violates review policy', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('setReviewAdminResponse updates row', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ admin_response: null }]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await svc.setReviewAdminResponse(
      PROVIDER_ID,
      'r1',
      'Thanks for the feedback',
      'support case outcome reviewed',
      ADMIN_ID,
    );
    expect(dbQueryMock.mock.calls[1][1]).toEqual(['Thanks for the feedback', 'r1', PROVIDER_ID]);
  });
});

// ─── getProviderDisputes ────────────────────────────────────────────────────

describe('getProviderDisputes', () => {
  it('projects resolution_type as resolutionType (now paginated — MED-N13)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ count: '1' }])).mockResolvedValueOnce(
      rows([
        {
          id: 'd1',
          booking_id: 'b1',
          customer_id: 'c1',
          customer_name: 'Joe Cust',
          status: 'resolved',
          resolution_type: 'partial_refund',
          created_at: new Date('2024-02-01T00:00:00Z'),
        },
      ]),
    );
    const out = await svc.getProviderDisputes(PROVIDER_ID);
    expect(out.rows[0].resolutionType).toBe('partial_refund');
    expect(out.total).toBe(1);
  });
});

// ─── getProviderActivity ────────────────────────────────────────────────────

describe('getProviderActivity', () => {
  it('merges audit + login_attempts and sorts desc', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        user_id: USER_ID,
        phone: '+639170000000',
        first_name: 'Jane',
        last_name: 'Provider',
      }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'a1',
            user_id: USER_ID,
            actor_first: 'Jane',
            actor_last: 'Provider',
            actor_role: 'provider',
            action: 'PATCH /providers/x',
            entity_type: 'providers',
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
            created_at: new Date('2024-02-03T00:00:00Z'),
          },
        ]),
      )
      .mockResolvedValueOnce(rows([]));

    const out = await svc.getProviderActivity(PROVIDER_ID, 50);
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe('login'); // Feb 3 first
    expect(out[1].source).toBe('audit');
    expect(out[0].action).toBe('otp_verify:ok');
  });

  it('throws 404 when provider missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getProviderActivity(PROVIDER_ID, 10)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── Notes CRUD ─────────────────────────────────────────────────────────────

describe('Notes CRUD', () => {
  it('listProviderNotes orders pinned desc, then created desc (delegated to SQL)', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: NOTE_ID,
          provider_id: PROVIDER_ID,
          author_id: ADMIN_ID,
          author_name: 'Admin Joe',
          category: 'general',
          body: 'hello',
          pinned: true,
          created_at: new Date('2024-02-02T00:00:00Z'),
          updated_at: new Date('2024-02-02T00:00:00Z'),
        },
      ]),
    );
    const out = await svc.listProviderNotes(PROVIDER_ID);
    expect(out[0].pinned).toBe(true);
    expect(out[0].authorName).toBe('Admin Joe');
  });

  it('createProviderNote rejects empty body', async () => {
    await expect(
      svc.createProviderNote(PROVIDER_ID, ADMIN_ID, 'general', '   ', false),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('createProviderNote rejects invalid category', async () => {
    await expect(
      svc.createProviderNote(
        PROVIDER_ID,
        ADMIN_ID,
        'bogus' as unknown as svc.NoteCategory,
        'body',
        false,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('createProviderNote inserts note + admin_actions audit in one transaction (Bug 82)', async () => {
    dbTransactionMock.mockImplementationOnce(
      async (cb: (client: { query: jest.Mock }) => unknown) => {
        const clientQuery = jest.fn(async (sql: string) => {
          if (sql.startsWith('INSERT INTO provider_admin_notes')) {
            return rows([
              {
                id: NOTE_ID,
                provider_id: PROVIDER_ID,
                author_id: ADMIN_ID,
                category: 'quality',
                body: 'noted',
                pinned: false,
                created_at: new Date('2024-02-02T00:00:00Z'),
                updated_at: new Date('2024-02-02T00:00:00Z'),
              },
            ]);
          }
          if (sql.includes('SELECT (first_name')) {
            return rows([{ author_name: 'Admin Joe' }]);
          }
          if (sql.startsWith('INSERT INTO admin_actions')) {
            return rows([{ id: 'audit-note-create' }]);
          }
          return rows([]);
        });
        return cb({ query: clientQuery as unknown as jest.Mock });
      },
    );
    const out = await svc.createProviderNote(PROVIDER_ID, ADMIN_ID, 'quality', 'noted', false);
    expect(out.id).toBe(NOTE_ID);
    expect(out.category).toBe('quality');
    expect(out.authorName).toBe('Admin Joe');
  });

  it('updateProviderNote rejects non-author non-super-admin (403)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{
      author_id: 'someone-else', category: 'general', body: 'old body', pinned: false,
    }]));
    await expect(
      svc.updateProviderNote(PROVIDER_ID, NOTE_ID, ADMIN_ID, false, { body: 'new body' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('updateProviderNote allows super-admin override', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{
        author_id: 'someone-else', category: 'general', body: 'old body', pinned: false,
      }]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await svc.updateProviderNote(
      PROVIDER_ID,
      NOTE_ID,
      ADMIN_ID,
      true,
      { body: 'new body', pinned: true },
    );
    expect(dbQueryMock).toHaveBeenCalledTimes(3);
  });

  it('updateProviderNote 404 when note missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(
      svc.updateProviderNote(PROVIDER_ID, NOTE_ID, ADMIN_ID, true, { body: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleteProviderNote rejects non-author non-super-admin (403)', async () => {
    dbTransactionMock.mockImplementationOnce(
      async (cb: (client: { query: jest.Mock }) => unknown) => {
        const clientQuery = jest.fn(async (sql: string) => {
          if (/FROM provider_admin_notes[\s\S]*WHERE id/.test(sql)) {
            return rows([
              { author_id: 'someone-else', provider_id: PROVIDER_ID, deleted_at: null },
            ]);
          }
          return rows([]);
        });
        return cb({ query: clientQuery as unknown as jest.Mock });
      },
    );
    await expect(
      svc.deleteProviderNote(PROVIDER_ID, NOTE_ID, ADMIN_ID, false),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('deleteProviderNote soft-deletes when author + writes audit (Bug 80)', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    dbTransactionMock.mockImplementationOnce(
      async (cb: (client: { query: jest.Mock }) => unknown) => {
        const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          if (/FROM provider_admin_notes[\s\S]*WHERE id/.test(sql)) {
            return rows([{ author_id: ADMIN_ID, provider_id: PROVIDER_ID, deleted_at: null }]);
          }
          if (sql.startsWith('UPDATE provider_admin_notes')) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.startsWith('INSERT INTO admin_actions')) {
            return rows([{ id: 'audit-note-del' }]);
          }
          return rows([]);
        });
        return cb({ query: clientQuery as unknown as jest.Mock });
      },
    );
    await svc.deleteProviderNote(
      PROVIDER_ID,
      NOTE_ID,
      ADMIN_ID,
      false,
      'note no longer relevant',
    );
    // Soft delete (UPDATE), not hard DELETE.
    expect(calls.find((c) => /UPDATE provider_admin_notes/.test(c.sql))).toBeDefined();
    expect(calls.find((c) => /^DELETE FROM/.test(c.sql))).toBeUndefined();
    // Audit row inserted with provider_note_deleted verb.
    const audit = calls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain("'provider_note_deleted'");
    expect(audit!.sql).toContain("'provider_note'");
  });
});

// ─── updateProviderProfile ──────────────────────────────────────────────────

describe('updateProviderProfile', () => {
  function setupProfileTx(opts: {
    selectRows: {
      business_name: string | null;
      description: string | null;
      service_radius_km: number | null;
    }[];
    updateRowCount: number;
    auditId: string | null;
  }): { calls: { sql: string; params: unknown[] }[] } {
    const calls: { sql: string; params: unknown[] }[] = [];
    dbTransactionMock.mockImplementationOnce(
      async (cb: (client: { query: jest.Mock }) => unknown) => {
        const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          if (sql.includes('SELECT business_name')) return rows(opts.selectRows);
          if (sql.startsWith('UPDATE providers'))
            return { rows: [], rowCount: opts.updateRowCount };
          if (sql.startsWith('INSERT INTO admin_actions')) {
            return rows(opts.auditId ? [{ id: opts.auditId }] : []);
          }
          return rows([]);
        });
        return cb({ query: clientQuery as unknown as jest.Mock });
      },
    );
    return { calls };
  }

  it('rejects empty businessName', async () => {
    await expect(
      svc.updateProviderProfile(PROVIDER_ID, { businessName: '   ' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('enforces the live 50 km radius maximum and audits a valid override (Bug UX-266)', async () => {
    await expect(
      svc.updateProviderProfile(PROVIDER_ID, { serviceRadiusKm: 9999 }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbTransactionMock).not.toHaveBeenCalled();

    const { calls } = setupProfileTx({
      selectRows: [{ business_name: 'Old Co', description: null, service_radius_km: 50 }],
      updateRowCount: 1,
      auditId: 'audit-prof',
    });
    await svc.updateProviderProfile(PROVIDER_ID, { serviceRadiusKm: 50 }, ADMIN_ID);
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE providers'))!;
    expect(updateCall.params[0]).toBe(50);
    const auditCall = calls.find((c) => c.sql.startsWith('INSERT INTO admin_actions'))!;
    expect(auditCall).toBeDefined();
    expect(auditCall.sql).toContain("'provider_profile_updated'");
  });

  it('404 when no provider matches', async () => {
    setupProfileTx({ selectRows: [], updateRowCount: 0, auditId: null });
    await expect(
      svc.updateProviderProfile(PROVIDER_ID, { businessName: 'X' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('no-op when no fields provided', async () => {
    await svc.updateProviderProfile(PROVIDER_ID, {}, ADMIN_ID);
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

// ─── adjustProviderWallet (SACRED — money movement) ────────────────────────

describe('adjustProviderWallet', () => {
  function setupTransaction(
    selectRows: { id: string; available_balance: string }[],
    insertId: string | null,
    updateRowCount = 1,
    auditId: string | null = 'audit-1',
  ): { calls: { sql: string; params: unknown[] }[] } {
    const calls: { sql: string; params: unknown[] }[] = [];
    dbTransactionMock.mockImplementation(async (cb: (client: { query: jest.Mock }) => unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT w.id')) return rows(selectRows);
        if (sql.startsWith('UPDATE wallets')) return { rows: [], rowCount: updateRowCount };
        if (sql.startsWith('INSERT INTO wallet_transactions'))
          return rows(insertId ? [{ id: insertId }] : []);
        // Phase 14 Dispatch 06 — Bug 78: admin_actions audit row inside
        // the same transaction as the wallet write.
        if (sql.startsWith('INSERT INTO admin_actions'))
          return rows(auditId ? [{ id: auditId }] : []);
        return rows([]);
      });
      return cb({ query: clientQuery as unknown as jest.Mock });
    });
    return { calls };
  }

  it.each([
    [0, 'reason ok'],
    [1.5, 'reason ok'],
    [Number.NaN, 'reason ok'],
  ])('rejects invalid amount %p', async (amt) => {
    await expect(
      svc.adjustProviderWallet(PROVIDER_ID, amt as number, 'reason ok', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['', '    ', 'tiny'])('rejects bad reason %p', async (r) => {
    await expect(svc.adjustProviderWallet(PROVIDER_ID, 100, r, ADMIN_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('404 when wallet missing', async () => {
    setupTransaction([], 'tx1');
    await expect(
      svc.adjustProviderWallet(PROVIDER_ID, 100, 'good reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects when adjustment would make balance negative', async () => {
    setupTransaction([{ id: 'w1', available_balance: '50' }], 'tx1');
    await expect(
      svc.adjustProviderWallet(PROVIDER_ID, -100, 'good reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('credits wallet, writes paired adjustment ledger row, conserves money', async () => {
    const { calls } = setupTransaction([{ id: 'w1', available_balance: '500' }], 'tx-id-123');
    const result = await svc.adjustProviderWallet(
      PROVIDER_ID,
      250,
      'guarantee fund top-up case #42',
      ADMIN_ID,
    );

    expect(result).toEqual({
      walletId: 'w1',
      newAvailableBalance: 750,
      transactionId: 'tx-id-123',
    });

    // money conservation: balance_after === prev + delta (= 750)
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO wallet_transactions'))!;
    expect(insertCall).toBeDefined();
    const [walletId, amount, description, balanceAfter, refId] = insertCall.params as [
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
    expect(description).toContain('guarantee fund top-up case #42');
    expect(refId).toBe(`admin_adjustment:${ADMIN_ID}`);

    // wallet update used the same new balance
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE wallets'))!;
    expect(updateCall.params).toEqual([750, 'w1']);
  });

  it('debits wallet correctly when delta is negative', async () => {
    const { calls } = setupTransaction([{ id: 'w1', available_balance: '1000' }], 'tx-id-456');
    const result = await svc.adjustProviderWallet(
      PROVIDER_ID,
      -300,
      'reversal of erroneous credit',
      ADMIN_ID,
    );
    expect(result.newAvailableBalance).toBe(700);
    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO wallet_transactions'))!;
    const [, amount, , balanceAfter] = insertCall.params as [string, number, string, number];
    expect(amount).toBe(-300);
    expect(balanceAfter).toBe(700);
  });

  it('rolls back via thrown error when ledger insert returns no id', async () => {
    setupTransaction([{ id: 'w1', available_balance: '500' }], null);
    await expect(
      svc.adjustProviderWallet(PROVIDER_ID, 100, 'good reason here', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
