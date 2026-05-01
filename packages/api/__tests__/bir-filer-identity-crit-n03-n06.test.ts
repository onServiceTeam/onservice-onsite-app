// CRIT-N03 + CRIT-N06 fix verified — BIR filer identity is loaded from
// platform_settings (migration 090) and BIR-bound PDF generation refuses
// to run while any required value is the unset sentinel '__UNSET__'.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};
jest.mock('../src/config/redis.config', () => ({ redis: redisMock }));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  getBirFilerIdentity,
  getBirFilerIdentityRaw,
  BIR_FILER_UNSET_SENTINEL,
} from '../src/services/bir-filer-identity.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  redisMock.get.mockReset();
  redisMock.set.mockReset();
  redisMock.del.mockReset();
  // Force settings.service to fall through to DB.
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
});

describe('CRIT-N03 + N06 — BIR filer identity loader fails closed when unset', () => {
  it('CRIT-N03 — getBirFilerIdentity throws when bir_filer_tin is __UNSET__', async () => {
    // companyName configured, but tin still unset.
    dbQueryMock.mockImplementation(async (_sql: string, params: unknown[]) => {
      const key = params[0] as string;
      if (key === 'bir_filer_company_name') return { rows: [{ value: 'Real Co.' }], rowCount: 1 };
      if (key === 'bir_filer_tin') return { rows: [{ value: '__UNSET__' }], rowCount: 1 };
      if (key === 'bir_filer_address') return { rows: [{ value: '123 Real St.' }], rowCount: 1 };
      if (key === 'bir_filer_ptu_number') return { rows: [{ value: 'BIR-PTU-123' }], rowCount: 1 };
      if (key === 'bir_filer_vat_status') return { rows: [{ value: 'VAT-Registered' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(getBirFilerIdentity()).rejects.toThrow(/BIR filer identity not configured/);
    await expect(getBirFilerIdentity()).rejects.toThrow(/bir_filer_tin/);
  });

  it('CRIT-N03 — getBirFilerIdentity throws listing ALL unset keys', async () => {
    dbQueryMock.mockImplementation(async () => ({
      rows: [{ value: '__UNSET__' }],
      rowCount: 1,
    }));

    await expect(getBirFilerIdentity()).rejects.toThrow(
      /bir_filer_company_name.*bir_filer_tin.*bir_filer_address.*bir_filer_ptu_number/,
    );
  });

  it('CRIT-N03 — getBirFilerIdentity returns values when all set', async () => {
    dbQueryMock.mockImplementation(async (_sql: string, params: unknown[]) => {
      const key = params[0] as string;
      const map: Record<string, string> = {
        bir_filer_company_name: 'OnService Platform Inc.',
        bir_filer_tin: '123-456-789-000',
        bir_filer_address: 'Suite 1, 123 Bonifacio Global City, Taguig, NCR',
        bir_filer_ptu_number: 'BIR-PTU-2026-0001',
        bir_filer_vat_status: 'VAT-Registered',
      };
      return { rows: [{ value: map[key] }], rowCount: 1 };
    });

    const filer = await getBirFilerIdentity();
    expect(filer.companyName).toBe('OnService Platform Inc.');
    expect(filer.tin).toBe('123-456-789-000');
    expect(filer.address).toBe('Suite 1, 123 Bonifacio Global City, Taguig, NCR');
    expect(filer.ptuNumber).toBe('BIR-PTU-2026-0001');
    expect(filer.vatStatus).toBe('VAT-Registered');
  });

  it('CRIT-N03 — getBirFilerIdentityRaw returns sentinel without throwing (for health checks)', async () => {
    dbQueryMock.mockImplementation(async () => ({
      rows: [{ value: '__UNSET__' }],
      rowCount: 1,
    }));

    const filer = await getBirFilerIdentityRaw();
    expect(filer.companyName).toBe('__UNSET__');
    expect(filer.tin).toBe('__UNSET__');
    expect(BIR_FILER_UNSET_SENTINEL).toBe('__UNSET__');
  });

  it('CRIT-N03 — or.service no longer hardcodes "TIN: 000-000-000-000"', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/services/or.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/TIN: 000-000-000-000/);
    expect(src).not.toMatch(/Address: \[Placeholder\]/);
    expect(src).not.toMatch(/PTU.*\[Placeholder\]/);
    // Must reference filer fields instead.
    expect(src).toMatch(/filer\.tin/);
    expect(src).toMatch(/filer\.address/);
    expect(src).toMatch(/filer\.ptuNumber/);
    expect(src).toMatch(/filer\.companyName/);
  });

  it('CRIT-N03 — bir-2307.service no longer hardcodes placeholder TIN/address', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/services/bir-2307.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/TIN: 000-000-000-000/);
    expect(src).not.toMatch(/Address: \[Placeholder\]/);
    expect(src).toMatch(/filer\.tin/);
    expect(src).toMatch(/filer\.address/);
    expect(src).toMatch(/filer\.companyName/);
  });

  it('CRIT-N06 — vat-report.service no longer hardcodes placeholder TIN/address', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/services/vat-report.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/TIN: 000-000-000-000/);
    expect(src).not.toMatch(/Address: \[Placeholder\]/);
    expect(src).toMatch(/filer\.tin/);
    expect(src).toMatch(/filer\.address/);
    expect(src).toMatch(/filer\.companyName/);
  });
});
