import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-user-030', role: 'customer' };
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

const mockInvoiceService = { getInvoices: jest.fn(), getInvoiceDetail: jest.fn() };
jest.mock('../src/services/invoice.service', () => mockInvoiceService);
const mockBusinessControlService = { getCurrentBusinessTermsForMember: jest.fn() };
jest.mock('../src/services/business-control.service', () => mockBusinessControlService);
const mockInvoiceControlService = {
  getInvoiceBalance: jest.fn(),
  getInvoiceCustomerLedger: jest.fn(),
};
jest.mock('../src/services/business-invoice-control.service', () => mockInvoiceControlService);
const mockSettingsService = { getSettingArray: jest.fn() };
jest.mock('../src/services/settings.service', () => mockSettingsService);

import businessRouter from '../src/routes/business.routes';

it('Bug SEC-030 — malformed customer business inputs are rejected before service or money access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/business', businessRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  const businessId = '03003003-0030-4030-8030-030030030030';
  const memberId = '03003003-0030-4030-8030-030030030031';
  const categoryId = '03003003-0030-4030-8030-030030030033';
  const responses = await Promise.all([
    request(app).post('/business').send({}),
    request(app).get('/business?page=0'),
    request(app).get('/business/not-a-uuid'),
    request(app).patch(`/business/${businessId}`).send({ unexpected: true }),
    request(app).get('/business/not-a-uuid/terms/current'),
    request(app).get('/business/not-a-uuid/members'),
    request(app).post(`/business/${businessId}/members`).send({ targetUserId: memberId, role: 'owner' }),
    request(app).delete(`/business/${businessId}/members/not-a-uuid`),
    request(app).post(`/business/${businessId}/transfer-ownership`).send({ newOwnerUserId: 'not-a-uuid' }),
    request(app).get(`/business/${businessId}/contracts?pageSize=101`),
    request(app).post(`/business/${businessId}/contracts`).send({
      categoryId,
      contractType: 'recurring',
      agreedRate: 50_000,
      startDate: '2026-02-30',
    }),
    request(app).post(`/business/${businessId}/contracts/not-a-uuid/activate`),
    request(app).post(`/business/${businessId}/contracts/not-a-uuid/cancel`),
    request(app).get(`/business/${businessId}/invoices?page=-1`),
    request(app).get(`/business/${businessId}/invoices/not-a-uuid`),
  ]);

  expect(responses).toHaveLength(15);
  expect(responses.every((response) => response.status === 400)).toBe(true);
  expect(Object.values(mockBusinessService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(Object.values(mockInvoiceService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(mockBusinessControlService.getCurrentBusinessTermsForMember).not.toHaveBeenCalled();
  expect(Object.values(mockInvoiceControlService).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  expect(mockSettingsService.getSettingArray).not.toHaveBeenCalled();
});
