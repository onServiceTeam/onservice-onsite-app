const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { previewPricingRuleDraft } from '../src/services/pricing-publication.service';

it('Bug OPS-324 — preview uses canonical catalog and area data through the booking resolver and explains the winner and split', async () => {
  const draftId = '00000000-0000-4000-8000-000000000324';
  const activeId = '00000000-0000-4000-8000-000000000325';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const subcategoryId = '00000000-0000-4000-8000-000000000002';
  const categoryId = '00000000-0000-4000-8000-000000000003';
  const areaId = '00000000-0000-4000-8000-000000000004';
  const previewId = '00000000-0000-4000-8000-000000000005';
  const updatedAt = new Date('2026-09-02T01:00:00.000Z');
  const expiresAt = new Date('2026-09-02T01:15:00.000Z');

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE')) {
      return { rows: [{
        id: draftId,
        name: 'Christmas support coverage',
        type: 'holiday',
        multiplier: '1.50',
        rush_hours_threshold: null,
        holiday_date: '2026-12-25',
        peak_start_time: null,
        peak_end_time: null,
        peak_days_of_week: null,
        category_id: categoryId,
        service_area_id: areaId,
        is_active: false,
        priority: 20,
        platform_surge_share: '0.00',
        description: '',
        publication_status: 'draft',
        created_at: updatedAt,
        updated_at: updatedAt,
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, updated_at, publication_status, is_active')) {
      return { rows: [{ id: activeId, updated_at: updatedAt, publication_status: 'published', is_active: true }], rowCount: 1 };
    }
    if (sql.includes('FROM service_subcategories ss')) {
      return { rows: [{
        id: subcategoryId,
        name: 'Deep clean',
        category_id: categoryId,
        category_name: 'Cleaning',
        pricing_type: 'fixed',
        base_price: '100000',
        is_active: true,
        category_is_active: true,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM service_areas WHERE id')) {
      return { rows: [{
        id: areaId,
        name: 'Metro Cebu',
        city: 'Cebu City',
        province: 'Cebu',
        status: 'active',
      }], rowCount: 1 };
    }
    if (sql.includes('LEFT JOIN service_areas sa')) {
      return { rows: [{
        id: activeId,
        name: 'Lower existing Christmas rule',
        type: 'holiday',
        multiplier: '1.20',
        rush_hours_threshold: null,
        holiday_date: '2026-12-25',
        peak_start_time: null,
        peak_end_time: null,
        peak_days_of_week: null,
        category_id: categoryId,
        service_area_id: areaId,
        is_active: true,
        priority: 10,
        platform_surge_share: '0.50',
        description: '',
        publication_status: 'published',
        created_at: updatedAt,
        updated_at: updatedAt,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO pricing_rule_previews')) {
      return { rows: [{
        id: previewId,
        pricing_rule_id: draftId,
        created_by: actorId,
        expires_at: expiresAt,
        created_at: updatedAt,
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const preview = await previewPricingRuleDraft(draftId, {
    samples: [{
      subcategoryId,
      serviceAreaId: areaId,
      scheduledAt: '2026-12-25T10:00:00.000+08:00',
    }],
  }, actorId);

  expect(preview.id).toBe(previewId);
  expect(preview.results[0]).toMatchObject({
    basePrice: 100000,
    surgeMultiplier: 1.5,
    surgeAmount: 50000,
    finalPrice: 150000,
    platformSurgeShare: 0,
    providerSurgeShare: 50000,
    winningRule: { id: draftId, isDraft: true },
  });
  expect(preview.results[0]?.matchingRules).toEqual([
    expect.objectContaining({ id: draftId, priority: 20, isDraft: true }),
    expect.objectContaining({ id: activeId, priority: 10, isDraft: false }),
  ]);
});
