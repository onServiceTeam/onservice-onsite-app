import express from 'express';
import request from 'supertest';

const mutationMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '00000000-0000-4000-8000-000000000001', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/business-control.service', () => ({
  previewAccountLifecycle: (...args: unknown[]) => mutationMock(...args),
  applyAccountLifecycleDecision: (...args: unknown[]) => mutationMock(...args),
  previewBusinessTerms: (...args: unknown[]) => mutationMock(...args),
  publishBusinessTerms: (...args: unknown[]) => mutationMock(...args),
  previewContractLifecycle: (...args: unknown[]) => mutationMock(...args),
  applyContractLifecycleDecision: (...args: unknown[]) => mutationMock(...args),
}));
jest.mock('../src/services/business-invoice-control.service', () => ({
  finalizeInvoice: (...args: unknown[]) => mutationMock(...args),
  recordInvoicePayment: (...args: unknown[]) => mutationMock(...args),
  recordInvoiceAdjustment: (...args: unknown[]) => mutationMock(...args),
  reverseInvoicePayment: (...args: unknown[]) => mutationMock(...args),
  voidInvoice: (...args: unknown[]) => mutationMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-028 — B2B publication and money decisions reject ordinary admins before service mutation', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);
  const accountId = '00000000-0000-4000-8000-000000000028';
  const contractId = '00000000-0000-4000-8000-000000000029';
  const invoiceId = '00000000-0000-4000-8000-000000000030';
  const previewId = '00000000-0000-4000-8000-000000000031';
  const paymentId = '00000000-0000-4000-8000-000000000032';
  const reason = 'Reviewed against the controlled commercial impact preview.';

  const responses = await Promise.all([
    request(app).post(`/admin/business-accounts/${accountId}/approve/preview`).send({}),
    request(app).post(`/admin/business-accounts/${accountId}/suspend/preview`).send({}),
    request(app).post(`/admin/business-accounts/${accountId}/terms/preview`).send({
      expectedVersion: 1,
      paymentTerms: 'net_30',
      volumeDiscountRate: 5,
      monthlyCreditLimit: 100_000,
    }),
    request(app).post(`/admin/business-accounts/${accountId}/contracts/${contractId}/publish/preview`).send({}),
    request(app).post(`/admin/business-accounts/${accountId}/contracts/${contractId}/cancel/preview`).send({}),
    request(app).post(`/admin/business-accounts/${accountId}/approve`).send({ previewId, reason }),
    request(app).post(`/admin/business-accounts/${accountId}/terms/publish`).send({ previewId, reason }),
    request(app).post(`/admin/business-accounts/${accountId}/contracts/${contractId}/publish`).send({ previewId, reason }),
    request(app).post(`/admin/business-accounts/${accountId}/contracts/${contractId}/cancel`).send({ previewId, reason }),
    request(app).post(`/admin/invoices/${invoiceId}/finalize`).send({ expectedVersion: 1, reason }),
    request(app).post(`/admin/invoices/${invoiceId}/payments`).send({
      expectedVersion: 1, amount: 10_000, currency: 'PHP', method: 'bank_transfer',
      effectiveAt: '2026-09-01T00:00:00.000Z', externalReference: 'BANK-028',
      evidenceReference: 'Private bank statement 028', reason,
    }),
    request(app).post(`/admin/invoices/${invoiceId}/adjustments`).send({
      expectedVersion: 1, adjustmentType: 'credit', amount: 1_000, currency: 'PHP',
      evidenceReference: 'Support case 028', reason,
    }),
    request(app).post(`/admin/invoices/${invoiceId}/payments/${paymentId}/reverse`).send({
      expectedVersion: 1, amount: 1_000, currency: 'PHP',
      effectiveAt: '2026-09-01T00:00:00.000Z', externalReference: 'BANK-REVERSAL-028',
      evidenceReference: 'Private refund statement 028', reason,
    }),
    request(app).post(`/admin/invoices/${invoiceId}/void`).send({ expectedVersion: 1, reason }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([
    403, 403, 403, 403, 403,
    403, 403, 403, 403, 403, 403, 403, 403, 403,
  ]);
  expect(mutationMock).not.toHaveBeenCalled();
});
