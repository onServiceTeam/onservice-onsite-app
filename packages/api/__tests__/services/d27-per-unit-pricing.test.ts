// D27 Phase 4 — per-unit pricing on subcategories.
//
// A per_unit subcategory carries unit_label + unit_price (centavos/unit). The
// service requires both for a per_unit service, rejects a negative unit price,
// and persists the columns on create/update.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createSubcategory, updateSubcategory } from '../../src/services/catalog.service';
import {
  resetDbMock, getTxCalls, setTxQueryImpl, setTopQueryImpl, makeRouter,
} from '../helpers/d06-tx-mock';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const SUBCATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const SERVICE_SCOPE = 'Includes measured wall preparation and painting work as agreed in the quote.';

function subRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUBCATEGORY_ID, category_id: CATEGORY_ID, name: 'Wall painting', slug: 'wall-painting',
    description: SERVICE_SCOPE, pricing_type: 'per_unit', base_price: null, min_price: null, max_price: null,
    estimated_duration_minutes: null, unit_label: 'sqm', unit_price: 5000, display_order: 0,
    is_active: true, created_at: new Date(), updated_at: new Date(), ...over,
  };
}

beforeEach(resetDbMock);

describe('D27 Phase 4 — per-unit pricing', () => {
  describe('createSubcategory', () => {
    it('persists unit_label + unit_price for a per_unit service', async () => {
      setTxQueryImpl(makeRouter([
        { match: /INSERT INTO service_subcategories/, rows: [subRow()], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit' }], rowCount: 1 },
      ]));

      await createSubcategory(
        { categoryId: CATEGORY_ID, name: 'Wall painting', description: SERVICE_SCOPE, pricingType: 'per_unit', unitLabel: 'sqm', unitPrice: 5000 },
        ADMIN_ID,
      );

      const insert = getTxCalls().find((c) => /INSERT INTO service_subcategories/.test(c.sql))!;
      expect(insert.sql).toMatch(/unit_label, unit_price/);
      expect(insert.params).toContain('sqm');
      expect(insert.params).toContain(5000);
    });

    it('rejects a per_unit service with no unit price', async () => {
      await expect(
        createSubcategory(
          { categoryId: CATEGORY_ID, name: 'Wall painting', description: SERVICE_SCOPE, pricingType: 'per_unit', unitLabel: 'sqm' },
          ADMIN_ID,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a per_unit service with no unit label', async () => {
      await expect(
        createSubcategory(
          { categoryId: CATEGORY_ID, name: 'Wall painting', description: SERVICE_SCOPE, pricingType: 'per_unit', unitPrice: 5000 },
          ADMIN_ID,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a negative unit price', async () => {
      await expect(
        createSubcategory(
          { categoryId: CATEGORY_ID, name: 'Wall painting', description: SERVICE_SCOPE, pricingType: 'per_unit', unitLabel: 'sqm', unitPrice: -1 },
          ADMIN_ID,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateSubcategory', () => {
    it('rejects switching to per_unit without a rate', async () => {
      setTopQueryImpl(makeRouter([
        { match: /SELECT description, is_active, base_price/, rows: [{
          description: SERVICE_SCOPE, is_active: true, pricing_type: 'fixed', unit_label: null,
          unit_price: null, hourly_rate: null, base_price: 1000, min_price: null, max_price: null,
        }], rowCount: 1 },
      ]));
      await expect(
        updateSubcategory(SUBCATEGORY_ID, { pricingType: 'per_unit' }, ADMIN_ID),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('persists unit_label + unit_price on a valid per_unit update', async () => {
      setTopQueryImpl(makeRouter([
        { match: /SELECT description, is_active, base_price/, rows: [{
          description: SERVICE_SCOPE, is_active: true, pricing_type: 'fixed', unit_label: null,
          unit_price: null, hourly_rate: null, base_price: 1000, min_price: null, max_price: null,
        }], rowCount: 1 },
      ]));
      setTxQueryImpl(makeRouter([
        { match: /UPDATE service_subcategories/, rows: [subRow()], rowCount: 1 },
        { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit' }], rowCount: 1 },
      ]));

      await updateSubcategory(
        SUBCATEGORY_ID,
        { pricingType: 'per_unit', unitLabel: 'sqm', unitPrice: 5000 },
        ADMIN_ID,
      );

      const update = getTxCalls().find((c) => /UPDATE service_subcategories/.test(c.sql))!;
      expect(update.sql).toMatch(/unit_label =/);
      expect(update.sql).toMatch(/unit_price =/);
      expect(update.params).toContain('sqm');
      expect(update.params).toContain(5000);
    });
  });
});
