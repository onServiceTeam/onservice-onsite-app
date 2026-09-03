const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getCommissionRateById } from '../src/services/commission-control.service';

it('Bug OPS-422 - exact commission evidence loads one retained cancelled agreement independently of the list', async () => {
  const rateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: rateId,
    scope_type: 'tier',
    tier: 'verified',
    provider_id: null,
    provider_name: null,
    provider_tier: null,
    service_category_id: null,
    category_name: null,
    service_subcategory_id: null,
    subcategory_name: null,
    rate_basis_points: 1300,
    effective_from: new Date('2026-10-01T00:00:00.000Z'),
    reason: 'Approved prospective Verified tier agreement.',
    source: 'admin_schedule',
    source_metadata: { previewedImpact: { existingSnapshotCount: 5 } },
    created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    created_by_name: 'Finance Owner',
    approved_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    approved_by_name: 'Finance Owner',
    created_at: new Date('2026-09-03T00:00:00.000Z'),
    cancellation_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    cancellation_reason: 'Commercial launch was postponed after review.',
    cancelled_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    cancelled_by_name: 'Finance Owner',
    cancelled_at: new Date('2026-09-04T00:00:00.000Z'),
    snapshot_usage_count: '0',
    lifecycle_status: 'cancelled',
  }] });

  const result = await getCommissionRateById(rateId);

  expect(result).toMatchObject({
    id: rateId,
    rateBasisPoints: 1300,
    ratePercent: 13,
    lifecycleStatus: 'cancelled',
    cancellation: { reason: 'Commercial launch was postponed after review.' },
  });
  const [sql, params] = dbQueryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toContain('WHERE crv.id = $1');
  expect(sql).toContain("crv.scope_type IN ('tier', 'provider')");
  expect(sql).not.toContain('LIMIT $1 OFFSET $2');
  expect(params).toEqual([rateId]);
});
