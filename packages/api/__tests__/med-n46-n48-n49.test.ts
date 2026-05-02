// MED-N46 / MED-N48 / MED-N49 fixes verified.

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

import { createServiceArea } from '../src/services/service-area.service';

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

describe('MED-N48 — createServiceArea writes admin_actions audit', () => {
  it('MED-N48 — writes admin_actions config_changed when createdByAdminId provided', async () => {
    // INSERT service_areas RETURNING.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'a-1', name: 'Boracay Station 2', slug: 'boracay-station-2',
        city: 'Malay', province: 'Aklan', region: 'Region VI',
        zip_codes: [], center_lat: 11.96, center_lng: 121.92, radius_km: 10,
        min_providers_to_launch: 5, launch_date: null, settings: {},
        is_active: true, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // INSERT admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await createServiceArea({
      name: 'Boracay Station 2',
      city: 'Malay',
      province: 'Aklan',
      region: 'Region VI',
      centerLat: 11.96,
      centerLng: 121.92,
      createdByAdminId: 'super-1',
    });

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/config_changed/);
    expect(auditCall![0]).toMatch(/'service_area'/);
    const params = auditCall![1] as unknown[];
    expect(params[0]).toBe('super-1');
    expect(params[1]).toBe('a-1');
    const details = JSON.parse(params[2] as string);
    expect(details.op).toBe('create');
    expect(details.name).toBe('Boracay Station 2');
  });

  it('MED-N48 — back-compat: no audit row when createdByAdminId omitted', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'a-1', name: 'X', slug: 'x', city: 'C', province: 'P', region: 'R',
        zip_codes: [], center_lat: 0, center_lng: 0, radius_km: 5,
        min_providers_to_launch: 5, launch_date: null, settings: {},
        is_active: true, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    await createServiceArea({
      name: 'X', city: 'C', province: 'P', region: 'R',
      centerLat: 0, centerLng: 0,
    });
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeUndefined();
  });
});

describe('MED-N49 — generateSlug fallback uses crypto.randomBytes', () => {
  it('MED-N49 — source uses crypto.randomBytes not Math.random', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/services/service-area.service.ts'),
      'utf8',
    ) as string;
    // Get generateSlug body, then strip line comments so we don't
    // accidentally match the documentation comment that mentions
    // "Math.random" while explaining the fix.
    const generateSlugBody = src.match(/function generateSlug\([\s\S]*?\n\}/);
    expect(generateSlugBody).not.toBeNull();
    const codeOnly = generateSlugBody![0]
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/Math\.random/);
    expect(codeOnly).toMatch(/crypto\.randomBytes/);
  });
});

// MED-N46 + MED-N47 source-shape verification.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const VAT_REPORT = readFileSync(
  resolve(__dirname, '../src/services/vat-report.service.ts'),
  'utf8',
);

describe('MED-N46 — vat-report generateMonthlyVatReport runs SELECT FOR UPDATE + upsert in trx', () => {
  it('MED-N46 — uses db.transaction with FOR UPDATE on the existing-row check', () => {
    expect(VAT_REPORT).toMatch(/db\.transaction\(async \(client\)/);
    // SELECT FOR UPDATE on the monthly report row.
    expect(VAT_REPORT).toMatch(/SELECT[\s\S]*?FROM vat_monthly_reports[\s\S]*?WHERE period_year[\s\S]*?FOR UPDATE/);
  });

  it('MED-N46 — upsert WHERE clause adds finalized_at IS NULL guard', () => {
    expect(VAT_REPORT).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE vat_monthly_reports\.finalized_at IS NULL/);
  });

  it('MED-N47 — upsert no longer NULLs pdf_url during regen', () => {
    // The DO UPDATE clause must NOT contain pdf_url = NULL.
    const upsertBlock = VAT_REPORT.match(/ON CONFLICT \(period_year, period_month\) DO UPDATE[\s\S]*?RETURNING/);
    expect(upsertBlock).not.toBeNull();
    expect(upsertBlock![0]).not.toMatch(/pdf_url\s*=\s*NULL/);
  });
});
