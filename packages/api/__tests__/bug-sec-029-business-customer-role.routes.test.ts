import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'provider-user-029', role: 'provider' };
    next();
  },
}));

const mockBusinessService = {
  createBusinessAccount: jest.fn(),
  getBusinessAccount: jest.fn(),
  getUserBusinessAccounts: jest.fn(),
  updateBusinessAccount: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  transferOwnership: jest.fn(),
  getContracts: jest.fn(),
  createContract: jest.fn(),
  updateContractStatus: jest.fn(),
};
jest.mock('../src/services/business.service', () => mockBusinessService);

const mockInvoiceService = {
  getInvoices: jest.fn(),
  getInvoiceDetail: jest.fn(),
};
jest.mock('../src/services/invoice.service', () => mockInvoiceService);

const mockBusinessControlService = { getCurrentBusinessTermsForMember: jest.fn() };
jest.mock('../src/services/business-control.service', () => mockBusinessControlService);

const mockInvoiceControlService = {
  getInvoiceBalance: jest.fn(),
  getInvoiceCustomerLedger: jest.fn(),
};
jest.mock('../src/services/business-invoice-control.service', () => mockInvoiceControlService);
jest.mock('../src/services/settings.service', () => ({ getSettingArray: jest.fn() }));

import businessRouter from '../src/routes/business.routes';

it('Bug SEC-029 — a provider cannot access any customer-owned business-account endpoint', async () => {
  const app = express();
  app.use(express.json());
  app.use('/business', businessRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  const businessId = '02902902-9029-4029-8029-029029029029';
  const memberId = '02902902-9029-4029-8029-029029029030';
  const contractId = '02902902-9029-4029-8029-029029029031';
  const invoiceId = '02902902-9029-4029-8029-029029029032';
  const responses = await Promise.all([
    request(app).post('/business').send({}),
    request(app).get('/business'),
    request(app).get(`/business/${businessId}`),
    request(app).patch(`/business/${businessId}`).send({}),
    request(app).get(`/business/${businessId}/terms/current`),
    request(app).get(`/business/${businessId}/members`),
    request(app).post(`/business/${businessId}/members`).send({}),
    request(app).delete(`/business/${businessId}/members/${memberId}`),
    request(app).post(`/business/${businessId}/transfer-ownership`).send({}),
    request(app).get(`/business/${businessId}/contracts`),
    request(app).post(`/business/${businessId}/contracts`).send({}),
    request(app).post(`/business/${businessId}/contracts/${contractId}/activate`),
    request(app).post(`/business/${businessId}/contracts/${contractId}/cancel`),
    request(app).get(`/business/${businessId}/invoices`),
    request(app).get(`/business/${businessId}/invoices/${invoiceId}`),
  ]);

  expect(responses).toHaveLength(15);
  expect(responses.every((response) => response.status === 403)).toBe(true);
  expect(responses.every((response) => response.body.message === 'Customer access required.')).toBe(true);
  expect(Object.values(mockBusinessService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(Object.values(mockInvoiceService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(mockBusinessControlService.getCurrentBusinessTermsForMember).not.toHaveBeenCalled();
  expect(Object.values(mockInvoiceControlService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
});
