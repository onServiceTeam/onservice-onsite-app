// Phase 14 Dispatch 06 — Bug 237.
// Catalog mutations (categories, subcategories, addons) extracted from
// inline route handlers into catalog.service.ts. Each mutation now
// wraps its row write + admin_actions audit insert in ONE db.transaction.
// Cache invalidation stays post-commit (route handler responsibility).

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// MED-M09 — createAddon now consults settings.service.getSettingNumber
// for the live addon-price ceiling. Mock returns a high number so the
// existing test fixtures (price: 25000) pass.
jest.mock('../../src/services/settings.service', () => ({
  getSettingNumber: jest.fn().mockResolvedValue(10_000_000),
}));

import {
  createCategory,
  updateCategory,
  createSubcategory,
  updateSubcategory,
  createAddon,
  updateAddon,
  deleteAddon,
} from '../../src/services/catalog.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  setTopQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const SUBCATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const ADDON_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(resetDbMock);

describe('Bug 237 — catalog mutations transactional', () => {
  describe('createCategory', () => {
    it('writes category row + admin_actions audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /INSERT INTO service_categories/, rows: [{
          id: CATEGORY_ID,
          name: 'Cleaning',
          slug: 'cleaning',
          description: '',
          icon_url: null,
          display_order: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-cat-create' }], rowCount: 1 },
      ]));

      const out = await createCategory({ name: 'Cleaning' }, ADMIN_ID);

      expect(getTransactionInvocations()).toBe(1);
      expect(out.id).toBe(CATEGORY_ID);
      const txCalls = getTxCalls();
      const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
      expect(audit!.sql).toContain("'service_category_created'");
      expect(audit!.sql).toContain("'service_category'");
    });

    it('rolls back when audit insert throws', async () => {
      setTxQueryImpl(makeRouter([
        { match: /INSERT INTO service_categories/, rows: [{ id: CATEGORY_ID, name: 'X', slug: 'x', description: '', icon_url: null, display_order: 0, is_active: true, created_at: new Date(), updated_at: new Date() }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, throwError: new Error('audit boom') },
      ]));
      await expect(createCategory({ name: 'X' }, ADMIN_ID)).rejects.toThrow(/audit boom/);
    });

    it('rejects empty name with 400', async () => {
      await expect(createCategory({ name: '   ' }, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
      expect(getTransactionInvocations()).toBe(0);
    });
  });

  describe('updateCategory', () => {
    it('updates row + writes audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_categories/, rows: [{ id: CATEGORY_ID, name: 'New Name', slug: 'new-name', description: '', icon_url: null, display_order: 0, is_active: true, created_at: new Date(), updated_at: new Date() }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-cat-update' }], rowCount: 1 },
      ]));

      await updateCategory(CATEGORY_ID, { name: 'New Name' }, ADMIN_ID);
      const txCalls = getTxCalls();
      expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))!.sql).toContain("'service_category_updated'");
    });

    it('404 when category missing', async () => {
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_categories/, rows: [], rowCount: 0 },
      ]));
      await expect(updateCategory(CATEGORY_ID, { name: 'X' }, ADMIN_ID)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects empty patch with 400', async () => {
      await expect(updateCategory(CATEGORY_ID, {}, ADMIN_ID)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('createSubcategory', () => {
    it('writes subcategory row + audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /INSERT INTO service_subcategories/, rows: [{
          id: SUBCATEGORY_ID,
          category_id: CATEGORY_ID,
          name: 'Deep clean',
          slug: 'deep-clean',
          description: '',
          pricing_type: 'fixed',
          base_price: 50000,
          min_price: null,
          max_price: null,
          estimated_duration_minutes: 120,
          display_order: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-sub' }], rowCount: 1 },
      ]));

      await createSubcategory({ categoryId: CATEGORY_ID, name: 'Deep clean', basePrice: 50000 }, ADMIN_ID);

      const txCalls = getTxCalls();
      const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
      expect(audit!.sql).toContain("'service_subcategory_created'");
    });
  });

  describe('updateSubcategory', () => {
    it('updates row + writes audit inside one transaction', async () => {
      // The price-bounds check pre-fetches the existing row (top-level query).
      setTopQueryImpl(makeRouter([
        { match: /SELECT base_price, min_price, max_price/, rows: [{ base_price: 0, min_price: null, max_price: null }], rowCount: 1 },
      ]));
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_subcategories/, rows: [{ id: SUBCATEGORY_ID, category_id: CATEGORY_ID, name: 'X', slug: 'x', description: '', pricing_type: 'fixed', base_price: 0, min_price: null, max_price: null, estimated_duration_minutes: null, display_order: 0, is_active: true, created_at: new Date(), updated_at: new Date() }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-subupdate' }], rowCount: 1 },
      ]));

      await updateSubcategory(SUBCATEGORY_ID, { basePrice: 75000 }, ADMIN_ID);
      const txCalls = getTxCalls();
      expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))!.sql).toContain("'service_subcategory_updated'");
    });

    it('rolls back when audit insert throws', async () => {
      setTopQueryImpl(makeRouter([
        { match: /SELECT base_price, min_price, max_price/, rows: [{ base_price: 0, min_price: null, max_price: null }], rowCount: 1 },
      ]));
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_subcategories/, rows: [{ id: SUBCATEGORY_ID, category_id: CATEGORY_ID, name: 'X', slug: 'x', description: '', pricing_type: 'fixed', base_price: 0, min_price: null, max_price: null, estimated_duration_minutes: null, display_order: 0, is_active: true, created_at: new Date(), updated_at: new Date() }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, throwError: new Error('audit boom') },
      ]));
      await expect(updateSubcategory(SUBCATEGORY_ID, { basePrice: 75000 }, ADMIN_ID)).rejects.toThrow(/audit boom/);
    });
  });

  describe('createAddon', () => {
    it('writes addon row + audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /INSERT INTO service_addons/, rows: [{ id: ADDON_ID, subcategory_id: SUBCATEGORY_ID, name: 'Extra room', description: '', price: 25000, is_active: true, display_order: 0 }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-addon' }], rowCount: 1 },
      ]));

      await createAddon({ subcategoryId: SUBCATEGORY_ID, name: 'Extra room', price: 25000 }, ADMIN_ID);
      const txCalls = getTxCalls();
      expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))!.sql).toContain("'service_addon_created'");
    });
  });

  describe('updateAddon', () => {
    it('updates addon + writes audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_addons/, rows: [{ id: ADDON_ID, subcategory_id: SUBCATEGORY_ID, name: 'New', description: '', price: 30000, is_active: true, display_order: 0 }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-addon-up' }], rowCount: 1 },
      ]));

      await updateAddon(ADDON_ID, { price: 30000 }, ADMIN_ID);
      const txCalls = getTxCalls();
      expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))!.sql).toContain("'service_addon_updated'");
    });
  });

  describe('deleteAddon', () => {
    it('soft-deactivates (UPDATE is_active=FALSE) + writes audit inside one transaction', async () => {
      setTxQueryImpl(makeRouter([
        { match: /SELECT \* FROM service_addons WHERE id/, rows: [{ id: ADDON_ID, subcategory_id: SUBCATEGORY_ID, name: 'Old addon', description: '', price: 10000, is_active: true, display_order: 0 }], rowCount: 1 },
        { match: /UPDATE service_addons SET is_active = FALSE/, rows: [{ id: ADDON_ID }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-addon-del' }], rowCount: 1 },
      ]));

      await deleteAddon(ADDON_ID, ADMIN_ID, 'no longer offered');

      const txCalls = getTxCalls();
      expect(txCalls.find((c) => /UPDATE service_addons/.test(c.sql))).toBeDefined();
      expect(txCalls.find((c) => /^DELETE FROM service_addons/.test(c.sql))).toBeUndefined();
      const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
      expect(audit!.sql).toContain("'service_addon_deleted'");
      expect(audit!.sql).toContain('full_notes');
    });

    it('rolls back when audit insert throws', async () => {
      setTxQueryImpl(makeRouter([
        { match: /SELECT \* FROM service_addons WHERE id/, rows: [{ id: ADDON_ID, subcategory_id: SUBCATEGORY_ID, name: 'X', description: '', price: 1, is_active: true, display_order: 0 }], rowCount: 1 },
        { match: /UPDATE service_addons SET is_active = FALSE/, rows: [{ id: ADDON_ID }], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, throwError: new Error('audit boom') },
      ]));
      await expect(deleteAddon(ADDON_ID, ADMIN_ID)).rejects.toThrow(/audit boom/);
    });

    it('409 when already deactivated', async () => {
      setTxQueryImpl(makeRouter([
        { match: /SELECT \* FROM service_addons WHERE id/, rows: [{ id: ADDON_ID, subcategory_id: SUBCATEGORY_ID, name: 'X', description: '', price: 1, is_active: false, display_order: 0 }], rowCount: 1 },
      ]));
      await expect(deleteAddon(ADDON_ID, ADMIN_ID)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('price bounds validation (audit 2026-06-04)', () => {
    it('createSubcategory rejects min > base', async () => {
      await expect(
        createSubcategory({ categoryId: CATEGORY_ID, name: 'Bad', minPrice: 5000, basePrice: 1000 }, ADMIN_ID),
      ).rejects.toThrow(/Minimum price cannot exceed the base price/);
    });

    it('createSubcategory rejects base > max', async () => {
      await expect(
        createSubcategory({ categoryId: CATEGORY_ID, name: 'Bad', basePrice: 9000, maxPrice: 5000 }, ADMIN_ID),
      ).rejects.toThrow(/Base price cannot exceed the maximum price/);
    });

    it('updateSubcategory rejects a patch that inverts bounds against the existing row', async () => {
      // Existing base = 1000; patching min up to 5000 would make min > base.
      setTopQueryImpl(makeRouter([
        { match: /SELECT base_price, min_price, max_price/, rows: [{ base_price: 1000, min_price: null, max_price: null }], rowCount: 1 },
      ]));
      await expect(
        updateSubcategory(SUBCATEGORY_ID, { minPrice: 5000 }, ADMIN_ID),
      ).rejects.toThrow(/Minimum price cannot exceed the base price/);
    });

    it('updateAddon rejects a price above the configured maximum', async () => {
      // getAddonPriceMaxCentsLive resolves to the mocked 10,000,000 cap.
      await expect(
        updateAddon(ADDON_ID, { price: 20_000_000 }, ADMIN_ID),
      ).rejects.toThrow(/exceeds the configured maximum/);
    });
  });

  it('no top-level mutation leaks for any catalog write', async () => {
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO service_categories/, rows: [{ id: CATEGORY_ID, name: 'X', slug: 'x', description: '', icon_url: null, display_order: 0, is_active: true, created_at: new Date(), updated_at: new Date() }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit' }], rowCount: 1 },
    ]));
    await createCategory({ name: 'X' }, ADMIN_ID);

    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO|UPDATE/.test(c.sql))).toBeUndefined();
  });
});
