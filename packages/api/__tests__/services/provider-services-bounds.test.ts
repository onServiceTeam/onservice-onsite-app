// Phase 14 Dispatch 05 — provider services bounds tests (Bug 1230).
//
// Verifies that `addProviderService` rejects basePrice values outside
// the subcategory's [min_price, max_price] range.

jest.mock('../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { db } from '../../src/models/db';
import { addProviderService } from '../../src/services/provider.service';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

const SUBCAT_BOUNDED = {
  id: 'subcat-1',
  name: 'General Cleaning',
  category_id: 'cat-1',
  min_price: 30000, // ₱300
  max_price: 200000, // ₱2,000
};

const PROVIDER_SERVICE_INSERTED = {
  id: 'ps-1',
  provider_id: 'prov-1',
  subcategory_id: 'subcat-1',
  category_id: 'cat-1',
  base_price: 50000,
  is_active: true,
};

interface QueryStub {
  match: RegExp;
  rows: unknown[];
}

function setupQueries(...stubs: QueryStub[]) {
  mockedQuery.mockImplementation((async (text: string) => {
    for (const stub of stubs) {
      if (stub.match.test(text)) {
        return {
          rows: stub.rows,
          rowCount: stub.rows.length,
          command: '',
          oid: 0,
          fields: [],
        };
      }
    }
    throw new Error(`provider-services-bounds.test: unexpected query: ${text}`);
  }) as never);
}

beforeEach(() => {
  mockedQuery.mockReset();
});

describe('Bug 1230 — addProviderService bounds enforcement', () => {
  it('bug-1230-subcat-bounds: rejects basePrice below min_price', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_BOUNDED] });
    await expect(
      addProviderService('prov-1', SUBCAT_BOUNDED.id, 10000),
    ).rejects.toThrow(/below subcategory minimum/);
  });

  it('rejects basePrice above max_price', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_BOUNDED] });
    await expect(
      addProviderService('prov-1', SUBCAT_BOUNDED.id, 500000),
    ).rejects.toThrow(/above subcategory maximum/);
  });

  it('accepts basePrice exactly at min_price', async () => {
    setupQueries(
      { match: /SELECT id, name, category_id, min_price, max_price/i, rows: [SUBCAT_BOUNDED] },
      { match: /INSERT INTO provider_services/i, rows: [{ ...PROVIDER_SERVICE_INSERTED, base_price: 30000 }] },
    );
    const result = await addProviderService('prov-1', SUBCAT_BOUNDED.id, 30000);
    expect(result.base_price).toBe(30000);
  });

  it('accepts basePrice exactly at max_price', async () => {
    setupQueries(
      { match: /SELECT id, name, category_id, min_price, max_price/i, rows: [SUBCAT_BOUNDED] },
      { match: /INSERT INTO provider_services/i, rows: [{ ...PROVIDER_SERVICE_INSERTED, base_price: 200000 }] },
    );
    const result = await addProviderService('prov-1', SUBCAT_BOUNDED.id, 200000);
    expect(result.base_price).toBe(200000);
  });

  it('rejects negative basePrice', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_BOUNDED] });
    await expect(
      addProviderService('prov-1', SUBCAT_BOUNDED.id, -1),
    ).rejects.toThrow(/positive integer/);
  });

  it('rejects NaN basePrice', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_BOUNDED] });
    await expect(
      addProviderService('prov-1', SUBCAT_BOUNDED.id, Number.NaN),
    ).rejects.toThrow(/positive integer/);
  });

  it('rejects non-integer basePrice', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_BOUNDED] });
    await expect(
      addProviderService('prov-1', SUBCAT_BOUNDED.id, 50000.5),
    ).rejects.toThrow(/positive integer/);
  });

  it('accepts when basePrice is omitted (no client-supplied override)', async () => {
    setupQueries(
      { match: /SELECT id, name, category_id, min_price, max_price/i, rows: [SUBCAT_BOUNDED] },
      { match: /INSERT INTO provider_services/i, rows: [PROVIDER_SERVICE_INSERTED] },
    );
    const result = await addProviderService('prov-1', SUBCAT_BOUNDED.id);
    expect(result.id).toBe('ps-1');
  });

  it('rejects unknown subcategory', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [] });
    await expect(
      addProviderService('prov-1', 'unknown-subcat', 50000),
    ).rejects.toThrow(/subcategory not found/i);
  });

  it('skips bounds check when subcat has no min/max set', async () => {
    setupQueries(
      {
        match: /service_subcategories/i,
        rows: [{ ...SUBCAT_BOUNDED, min_price: null, max_price: null }],
      },
      { match: /INSERT INTO provider_services/i, rows: [PROVIDER_SERVICE_INSERTED] },
    );
    const result = await addProviderService('prov-1', SUBCAT_BOUNDED.id, 999999999);
    expect(result.id).toBe('ps-1');
  });
});
