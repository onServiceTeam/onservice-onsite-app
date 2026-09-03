const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getInvoiceCustomerLedger } from '../src/services/business-invoice-control.service';

it('Bug OPS-340 — the customer statement ledger exposes amounts and references without internal reasons, evidence locations, or operator identities', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'adjustment-1', adjustment_type: 'credit', amount: '15000', currency: 'PHP',
      reason: 'Internal support investigation narrative', evidence_reference: 'private-case-file',
      recorded_by: 'staff-1', created_at: new Date('2026-09-02T01:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'payment-1', entry_type: 'payment', reverses_payment_id: null,
      amount: '85000', currency: 'PHP', method: 'bank_transfer',
      effective_at: new Date('2026-09-02T02:00:00.000Z'), external_reference: 'BANK-340',
      evidence_reference: 'private-bank-object', evidence_object_key: 'private/key',
      reason: 'Internal reconciliation narrative', recorded_by: 'staff-2',
      created_at: new Date('2026-09-02T02:01:00.000Z'),
    }], rowCount: 1 });

  const ledger = await getInvoiceCustomerLedger('invoice-340');

  expect(ledger.adjustments[0]).toEqual(expect.objectContaining({
    adjustmentType: 'credit', amount: 15000, currency: 'PHP',
  }));
  expect(ledger.payments[0]).toEqual(expect.objectContaining({
    entryType: 'payment', amount: 85000, externalReference: 'BANK-340',
  }));
  expect(JSON.stringify(ledger)).not.toContain('Internal');
  expect(JSON.stringify(ledger)).not.toContain('private-');
  expect(JSON.stringify(ledger)).not.toContain('staff-');
});
