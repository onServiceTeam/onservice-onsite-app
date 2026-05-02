/**
 * Phase 09 — unit tests for marketing-admin service.
 *
 * Mirrors the hermetic pattern of booking-dispute-admin.test.ts: db.query is
 * fully mocked, logger is mocked. No real SQL, no integration. We assert that
 * every audit insert uses the SQL LITERALS 'config_changed' (action_type) and
 * 'config' (target_type) so we never widen the admin_actions CHECK constraint
 * in this phase. We also assert the audit insert is wrapped in try/catch and
 * a failure does NOT prevent the main row from being returned.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

const loggerWarn = jest.fn();
const loggerInfo = jest.fn();
const loggerError = jest.fn();
const loggerDebug = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
  },
}));

// MED-N29 (D-J23) — marketing-admin.service now reads
// platform_settings.marketing_channels via settingsService.getSetting
// to support admin-tunable channels. Mock settingsService so the
// existing tests don't hit Redis/DB. Return the same default channel
// list these tests already exercise.
jest.mock('../src/services/settings.service', () => ({
  getSetting: async (key: string) => {
    if (key === 'marketing_channels') {
      return JSON.stringify([
        'facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer',
        'sms', 'email', 'referral', 'other',
      ]);
    }
    throw new Error(`unmocked setting: ${key}`);
  },
}));

import * as svc from '../src/services/marketing-admin.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const PROMO_ID = 'p0000000-0000-0000-0000-000000000001';
const CAMPAIGN_ID = 'c0000000-0000-0000-0000-000000000001';

function makePromoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROMO_ID,
    code: 'WELCOME10',
    description: 'desc',
    discount_type: 'percentage',
    discount_value: 10,
    max_discount_centavos: null,
    minimum_order_centavos: '0',
    usage_limit_total: null,
    usage_limit_per_customer: 1,
    times_used: 0,
    valid_from: new Date('2026-01-01T00:00:00Z'),
    valid_until: null,
    active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCampaignRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAMPAIGN_ID,
    name: 'Spring promo',
    channel: 'facebook_ads',
    started_at: new Date('2026-03-01T00:00:00Z'),
    ended_at: null,
    spend_centavos: '50000',
    attributed_signups: 10,
    attributed_first_bookings: 4,
    attributed_revenue_centavos: '120000',
    notes: null,
    created_at: new Date('2026-02-28T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  loggerDebug.mockReset();
});

// ─── createPromoCode: validation ────────────────────────────────────────────

describe('createPromoCode validation', () => {
  it('rejects too-short code with 400', async () => {
    await expect(
      svc.createPromoCode(
        { code: 'ab', discountType: 'percentage', discountValue: 10 },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('rejects lower-case code with 400', async () => {
    await expect(
      svc.createPromoCode(
        { code: 'lower-case', discountType: 'percentage', discountValue: 10 },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects percentage discount above 50', async () => {
    await expect(
      svc.createPromoCode(
        { code: 'BIG', discountType: 'percentage', discountValue: 75 },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects percentage discount of 0', async () => {
    await expect(
      svc.createPromoCode(
        { code: 'ZERO', discountType: 'percentage', discountValue: 0 },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects fixed_centavos discount below P1', async () => {
    await expect(
      svc.createPromoCode(
        { code: 'TINY', discountType: 'fixed_centavos', discountValue: 50 },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects validUntil before validFrom', async () => {
    await expect(
      svc.createPromoCode(
        {
          code: 'BADRANGE',
          discountType: 'percentage',
          discountValue: 10,
          validFrom: '2026-06-01T00:00:00Z',
          validUntil: '2026-01-01T00:00:00Z',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects negative minimumOrderCentavos', async () => {
    await expect(
      svc.createPromoCode(
        {
          code: 'NEG',
          discountType: 'percentage',
          discountValue: 10,
          minimumOrderCentavos: -1,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── createPromoCode: happy path + audit ────────────────────────────────────

describe('createPromoCode happy path', () => {
  it('inserts row and writes audit with literal config_changed/config', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makePromoRow()])) // INSERT promo_codes
      .mockResolvedValueOnce(rows([{ id: 'aa1' }])); // INSERT admin_actions

    const out = await svc.createPromoCode(
      { code: 'WELCOME10', discountType: 'percentage', discountValue: 10 },
      ADMIN_ID,
    );

    expect(out).toMatchObject({
      id: PROMO_ID,
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      active: true,
    });

    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toMatch(/INSERT INTO admin_actions/);
    expect(auditSql).toContain("'config_changed'");
    expect(auditSql).toContain("'config'");

    const auditParams = dbQueryMock.mock.calls[1][1] as unknown[];
    expect(auditParams[0]).toBe(ADMIN_ID);
    expect(auditParams[1]).toBe(PROMO_ID);
    const details = JSON.parse(String(auditParams[3])) as Record<string, unknown>;
    expect(details).toMatchObject({ kind: 'promo_create', code: 'WELCOME10' });
  });

  it('returns mapped object even if audit insert throws (warn logged)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makePromoRow()]))
      .mockRejectedValueOnce(new Error('audit boom'));

    const out = await svc.createPromoCode(
      { code: 'WELCOME10', discountType: 'percentage', discountValue: 10 },
      ADMIN_ID,
    );

    expect(out.id).toBe(PROMO_ID);
    expect(loggerWarn).toHaveBeenCalled();
  });
});

// ─── updatePromoCode ────────────────────────────────────────────────────────

describe('updatePromoCode', () => {
  it('throws 404 when row missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([])); // UPDATE returns no row

    await expect(
      svc.updatePromoCode(PROMO_ID, { description: 'x' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns existing record when patch is empty', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([makePromoRow()])); // SELECT
    const out = await svc.updatePromoCode(PROMO_ID, {}, ADMIN_ID);
    expect(out.id).toBe(PROMO_ID);
  });

  it('writes audit with literal config_changed/config on success', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makePromoRow({ description: 'updated' })]))
      .mockResolvedValueOnce(rows([{ id: 'aa1' }]));

    await svc.updatePromoCode(PROMO_ID, { description: 'updated' }, ADMIN_ID);

    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toContain("'config_changed'");
    expect(auditSql).toContain("'config'");
    const auditParams = dbQueryMock.mock.calls[1][1] as unknown[];
    const details = JSON.parse(String(auditParams[3])) as Record<string, unknown>;
    expect(details).toMatchObject({ kind: 'promo_update' });
  });
});

// ─── deactivatePromoCode ────────────────────────────────────────────────────

describe('deactivatePromoCode', () => {
  it('updates row to active=false and audits', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makePromoRow({ active: false })]))
      .mockResolvedValueOnce(rows([{ id: 'aa1' }]));

    const out = await svc.deactivatePromoCode(PROMO_ID, ADMIN_ID);
    expect(out.active).toBe(false);

    const updateSql = dbQueryMock.mock.calls[0][0] as string;
    expect(updateSql).toMatch(/UPDATE promo_codes/);
    expect(updateSql).toMatch(/active = FALSE/);

    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toContain("'config_changed'");
    expect(auditSql).toContain("'config'");
    const auditParams = dbQueryMock.mock.calls[1][1] as unknown[];
    const details = JSON.parse(String(auditParams[3])) as Record<string, unknown>;
    expect(details).toMatchObject({ kind: 'promo_deactivate' });
  });

  it('throws 404 when row missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(
      svc.deactivatePromoCode(PROMO_ID, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── listPromoCodes ─────────────────────────────────────────────────────────

describe('listPromoCodes', () => {
  it('applies active filter and counts total', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '3' }])) // COUNT
      .mockResolvedValueOnce(rows([makePromoRow(), makePromoRow({ id: 'p2' })]));

    const out = await svc.listPromoCodes({ active: true });
    expect(out.total).toBe(3);
    expect(out.rows).toHaveLength(2);

    const countSql = dbQueryMock.mock.calls[0][0] as string;
    const countParams = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(countSql).toMatch(/active = \$1/);
    expect(countParams[0]).toBe(true);
  });

  it('omits WHERE when no filter', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.listPromoCodes();
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).not.toMatch(/WHERE/);
  });
});

// ─── createCampaign: validation ─────────────────────────────────────────────

describe('createCampaign validation', () => {
  it('rejects bad date format', async () => {
    await expect(
      svc.createCampaign(
        { name: 'X', channel: 'facebook_ads', startedAt: '2026/01/01' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects endedAt before startedAt', async () => {
    await expect(
      svc.createCampaign(
        {
          name: 'X',
          channel: 'facebook_ads',
          startedAt: '2026-06-01',
          endedAt: '2026-01-01',
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects negative spendCentavos', async () => {
    await expect(
      svc.createCampaign(
        {
          name: 'X',
          channel: 'facebook_ads',
          startedAt: '2026-01-01',
          spendCentavos: -1,
        },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects unknown channel', async () => {
    await expect(
      svc.createCampaign(
        { name: 'X', channel: 'tv', startedAt: '2026-01-01' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects empty name', async () => {
    await expect(
      svc.createCampaign(
        { name: '   ', channel: 'facebook_ads', startedAt: '2026-01-01' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── createCampaign: happy path ─────────────────────────────────────────────

describe('createCampaign happy path', () => {
  it('inserts and writes audit with literal config_changed/config', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeCampaignRow()]))
      .mockResolvedValueOnce(rows([{ id: 'aa1' }]));

    const out = await svc.createCampaign(
      {
        name: 'Spring promo',
        channel: 'facebook_ads',
        startedAt: '2026-03-01',
        spendCentavos: 50000,
      },
      ADMIN_ID,
    );

    expect(out.cpaCentavos).toBe(5000); // 50000 / 10
    expect(out.roiPercent).toBe(140); // (120000 - 50000) / 50000 * 100

    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toContain("'config_changed'");
    expect(auditSql).toContain("'config'");
    const auditParams = dbQueryMock.mock.calls[1][1] as unknown[];
    const details = JSON.parse(String(auditParams[3])) as Record<string, unknown>;
    expect(details).toMatchObject({ kind: 'campaign_create', name: 'Spring promo' });
  });

  it('returns mapped object even when audit throws (warn logged)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeCampaignRow()]))
      .mockRejectedValueOnce(new Error('audit boom'));
    const out = await svc.createCampaign(
      { name: 'X', channel: 'sms', startedAt: '2026-01-01' },
      ADMIN_ID,
    );
    expect(out.id).toBe(CAMPAIGN_ID);
    expect(loggerWarn).toHaveBeenCalled();
  });
});

// ─── updateCampaign ─────────────────────────────────────────────────────────

describe('updateCampaign', () => {
  it('throws 404 when missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(
      svc.updateCampaign(CAMPAIGN_ID, { name: 'New' }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects negative attributedSignups', async () => {
    await expect(
      svc.updateCampaign(CAMPAIGN_ID, { attributedSignups: -5 }, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writes audit with literal config_changed/config on success', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([makeCampaignRow({ name: 'New' })]))
      .mockResolvedValueOnce(rows([{ id: 'aa1' }]));
    await svc.updateCampaign(CAMPAIGN_ID, { name: 'New' }, ADMIN_ID);
    const auditSql = dbQueryMock.mock.calls[1][0] as string;
    expect(auditSql).toContain("'config_changed'");
    expect(auditSql).toContain("'config'");
  });
});

// ─── getMarketingOverview ───────────────────────────────────────────────────

describe('getMarketingOverview', () => {
  it('aggregates by channel; computes per-channel cpa/roi and totals', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        { channel: 'facebook_ads', spend: '100000', signups: '10', revenue: '250000' },
        { channel: 'google_ads', spend: '50000', signups: '5', revenue: '40000' },
      ]),
    );

    const out = await svc.getMarketingOverview();
    expect(out.totalSpendCentavos).toBe(150000);
    expect(out.totalSignups).toBe(15);
    expect(out.totalRevenueCentavos).toBe(290000);
    expect(out.aggregateCpaCentavos).toBe(10000); // 150000/15
    expect(out.aggregateRoiPercent).toBe(93); // (290000-150000)/150000 ≈ 93.33

    const fb = out.channelBreakdown.find((r) => r.channel === 'facebook_ads')!;
    expect(fb.cpaCentavos).toBe(10000);
    expect(fb.roiPercent).toBe(150); // (250000-100000)/100000

    const gg = out.channelBreakdown.find((r) => r.channel === 'google_ads')!;
    expect(gg.cpaCentavos).toBe(10000);
    expect(gg.roiPercent).toBe(-20); // (40000-50000)/50000
  });

  it('returns cpa=0 when signups=0', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ channel: 'sms', spend: '5000', signups: '0', revenue: '0' }]),
    );
    const out = await svc.getMarketingOverview();
    expect(out.channelBreakdown[0].cpaCentavos).toBe(0);
    expect(out.aggregateCpaCentavos).toBe(0);
  });

  it('returns roi=0 when spend=0', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ channel: 'referral', spend: '0', signups: '20', revenue: '500000' }]),
    );
    const out = await svc.getMarketingOverview();
    expect(out.channelBreakdown[0].roiPercent).toBe(0);
    expect(out.aggregateRoiPercent).toBe(0);
  });

  it('respects from/to date filter', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.getMarketingOverview('2026-01-01', '2026-12-31');
    const sql = dbQueryMock.mock.calls[0][0] as string;
    const params = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(sql).toMatch(/started_at >= \$1/);
    expect(sql).toMatch(/started_at <= \$2/);
    expect(params).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('rejects invalid date filter', async () => {
    await expect(svc.getMarketingOverview('2026/01/01')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ─── getPromoCode / getCampaign nullables ───────────────────────────────────

describe('get* lookups', () => {
  it('getPromoCode returns null when missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    expect(await svc.getPromoCode(PROMO_ID)).toBeNull();
  });

  it('getCampaign returns null when missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    expect(await svc.getCampaign(CAMPAIGN_ID)).toBeNull();
  });
});
