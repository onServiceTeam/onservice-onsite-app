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
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'audit-1' }], rowCount: 1 });

    await createServiceArea({
      name: 'Boracay Station 2',
      city: 'Malay',
      province: 'Aklan',
      region: 'Region VI',
      centerLat: 11.96,
      centerLng: 121.92,
      createdByAdminId: 'super-1',
      reason: 'Opening this market after the launch readiness review.',
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

  it('MED-N48 — rejects an unexplained create before opening a transaction', async () => {
    await expect(createServiceArea({
      name: 'X', city: 'C', province: 'P', region: 'R',
      centerLat: 10, centerLng: 123,
      createdByAdminId: 'super-1',
      reason: '',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

describe('MED-N49 — generateSlug fallback uses crypto.randomBytes', () => {
  it('MED-N49 — a name without slug characters receives an eight-byte-safe URL suffix', async () => {
    dbQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'a-emoji', name: '🏝️', slug: 'placeholder', city: 'Malay', province: 'Aklan', region: 'Region VI',
          zip_codes: [], center_lat: 11.96, center_lng: 121.92, radius_km: 10,
          min_providers_to_launch: 5, launch_date: null, settings: {}, created_at: new Date(), updated_at: new Date(),
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-emoji' }], rowCount: 1 });

    await createServiceArea({
      name: '🏝️', city: 'Malay', province: 'Aklan', region: 'Region VI',
      centerLat: 11.96, centerLng: 121.92, createdByAdminId: 'super-1',
      reason: 'Creating a safely addressable operator market record.',
    });

    const areaInsert = dbQueryMock.mock.calls.find(([sql]) => /INSERT INTO service_areas/.test(sql as string));
    expect((areaInsert![1] as unknown[])[1]).toMatch(/^area-[0-9a-f]{8}$/);
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
