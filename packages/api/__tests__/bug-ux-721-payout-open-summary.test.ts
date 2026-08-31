const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug UX-721 — payout summary includes every reserved in-flight state instead of legacy processing only', async () => {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: 'payouts' }], rowCount: 1 };
    if (sql.includes('internal_review_count')) {
      expect(sql).toContain("status IN ('aml_review_pending', 'pending', 'approved', 'processing')");
      return {
        rows: [{
          pending_count: '7', pending_total: '900000', internal_review_count: '1',
          awaiting_approval_count: '2', approved_awaiting_transfer_count: '3', processing_count: '1',
          today_completed_count: '4', today_completed_total: '500000', failed_count: '2',
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await financialAdminService.getPayoutsSummary();

  expect(result).toMatchObject({
    available: true,
    pendingCount: 7,
    pendingTotalCentavos: 900_000,
    internalReviewCount: 1,
    awaitingApprovalCount: 2,
    approvedAwaitingTransferCount: 3,
    processingCount: 1,
  });
});
