jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn().mockResolvedValue(5_000_000),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { getAdminAddonsForSubcategory } from '../src/services/catalog.service';

it('Bug OPS-364 — admin add-on reads flag only active grandfathered rows above the effective cap', async () => {
  (db.query as jest.Mock).mockResolvedValue({
    rows: [
      { id: 'active-high', subcategory_id: 'service-1', name: 'Large package', description: '', price: 6_000_000, is_active: true, display_order: 1 },
      { id: 'inactive-high', subcategory_id: 'service-1', name: 'Retired package', description: '', price: 7_000_000, is_active: false, display_order: 2 },
      { id: 'active-ok', subcategory_id: 'service-1', name: 'Standard package', description: '', price: 4_000_000, is_active: true, display_order: 3 },
    ],
  });

  const result = await getAdminAddonsForSubcategory('service-1');

  expect(result.priceCapCentavos).toBe(5_000_000);
  expect(result.addons.map((addon) => ({ id: addon.id, flagged: addon.exceedsCurrentPriceCap }))).toEqual([
    { id: 'active-high', flagged: true },
    { id: 'inactive-high', flagged: false },
    { id: 'active-ok', flagged: false },
  ]);
});
