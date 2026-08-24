import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const getProofSummaryMock = jest.fn();
let currentUser = { userId: 'staff-user-1', role: 'provider_staff' };

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      ...currentUser, iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/booking-proof.service', () => {
  const actual = jest.requireActual('../src/services/booking-proof.service');
  return {
    ...actual,
    getBookingProofSummary: (...args: unknown[]) => getProofSummaryMock(...args),
  };
});
jest.mock('../src/services/booking.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import bookingRouter from '../src/routes/booking.routes';

it('Bug UX-309 — assigned staff receive the shared proof record without private support or held signature files', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      customer_id: 'customer-1', provider_user_id: 'provider-user-1',
      staff_user_id: 'staff-user-1', staff_status: 'approved',
    }],
    rowCount: 1,
  });
  getProofSummaryMock.mockResolvedValueOnce({
    booking: {
      id: 'booking-1', status: 'in_progress', bookingType: 'fixed_price', description: 'Service',
      categoryName: 'Cleaning', subcategoryName: null, scheduledAt: null, workStartedAt: null,
      workCompletedAt: null, completedAt: null, confirmedAt: null, completionNotes: null,
    },
    scope: { acceptedQuote: null },
    readiness: {
      stage: 'work_in_progress', readyForProviderCompletion: false,
      minimumTimeOnSiteMinutes: 15, afterPhotosRequired: 2, blockers: [], qualityFlags: [],
    },
    checklist: null,
    photos: [{
      id: 'photo-1', url: 'https://example.test/support-photo.jpg', photoType: 'issue',
      uploadedByUserId: 'admin-user-1', uploadedByRole: 'admin', uploaderName: 'Internal Admin',
      uploadedAt: '2026-08-25T00:00:00.000Z', source: 'canonical', mimeType: 'image/jpeg',
      originalSizeBytes: 120, storedSizeBytes: 100,
    }],
    photoCounts: { issue: 1 },
    signatures: {
      identityCaveat: 'Identity remains held under E19.',
      records: [{
        id: 'signature-1', signatureType: 'customer_acceptance', signedByUserId: 'provider-user-1',
        signedByRole: 'provider', signerName: 'Provider', fullNameTyped: 'Customer Name',
        signedAt: '2026-08-25T00:00:00.000Z', url: 'https://private.test/signature.png',
        attribution: 'provider_attributed_customer_acceptance',
      }],
    },
    changeOrders: [],
    communications: {
      chatMessageCount: 2,
      supportTickets: [{
        id: 'ticket-1', ticketNumber: 'SUP-1001', subject: 'Private customer report',
        status: 'open', priority: 'high', createdAt: '2026-08-25T00:00:00.000Z',
      }],
    },
    dispute: null,
    unavailable: [],
  });

  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' });
  });

  const response = await request(app).get('/bookings/booking-1/proof-summary');

  expect(response.status).toBe(200);
  expect(response.body.data.communications).toEqual({ chatMessageCount: 2, supportTickets: [] });
  expect(response.body.data.signatures.records[0]).toMatchObject({
    signedByUserId: '',
    url: '',
    fullNameTyped: null,
    attribution: 'provider_attributed_customer_acceptance',
  });
  expect(response.body.data.photos[0]).toMatchObject({
    uploadedByUserId: '',
    uploaderName: 'onService support',
    uploadedByRole: 'admin',
  });
  expect(getProofSummaryMock).toHaveBeenCalledWith('booking-1');

  currentUser = { userId: 'other-staff-user', role: 'provider_staff' };
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      customer_id: 'customer-1', provider_user_id: 'provider-user-1',
      staff_user_id: 'staff-user-1', staff_status: 'approved',
    }],
    rowCount: 1,
  });
  const unrelatedStaff = await request(app).get('/bookings/booking-1/proof-summary');
  expect(unrelatedStaff.status).toBe(403);

  currentUser = { userId: 'customer-1', role: 'customer' };
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      customer_id: 'customer-1', provider_user_id: 'provider-user-1',
      staff_user_id: 'staff-user-1', staff_status: 'approved',
    }],
    rowCount: 1,
  });
  getProofSummaryMock.mockResolvedValueOnce({
    ...response.body.data,
    communications: { chatMessageCount: 2, supportTickets: [] },
  });
  const customer = await request(app).get('/bookings/booking-1/proof-summary');
  expect(customer.status).toBe(200);
  expect(getProofSummaryMock).toHaveBeenCalledTimes(2);
});
