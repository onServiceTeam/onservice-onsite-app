import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const transactionMock = jest.fn();
const clientQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'customer-1', role: 'customer' };
    next();
  },
}));
jest.mock('../src/middleware/validation.middleware', () => ({
  validationMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const getWalletInTransactionMock = jest.fn();
const debitWalletInTransactionMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWalletInTransaction: (...args: unknown[]) => getWalletInTransactionMock(...args),
  debitWalletInTransaction: (...args: unknown[]) => debitWalletInTransactionMock(...args),
}));
const createWalletIntentMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  createWalletPaymentIntentInTransaction: (...args: unknown[]) => createWalletIntentMock(...args),
  formatPaymentIntent: jest.fn(),
}));
const holdEscrowMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  holdInEscrowInTransaction: (...args: unknown[]) => holdEscrowMock(...args),
}));
jest.mock('../src/services/booking.service', () => ({}));
const dispatchMock = jest.fn();
jest.mock('../src/services/booking-offer.service', () => ({
  dispatchPaidBookingIfNeeded: (...args: unknown[]) => dispatchMock(...args),
}));

import paymentRouter from '../src/routes/payment.routes';

function app(): express.Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/v1/payments', paymentRouter);
  instance.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return instance;
}

describe('OPS-212 — wallet booking payment is one transaction', () => {
  it('does not write booking or escrow state outside the transaction when the wallet debit fails', async () => {
    const client = { query: clientQueryMock };
    transactionMock.mockImplementation(async (callback: (arg: typeof client) => Promise<unknown>) => callback(client));
    clientQueryMock.mockResolvedValueOnce({
      rows: [{ customer_id: 'customer-1', status: 'requested', total_amount: '50000' }],
      rowCount: 1,
    });
    getWalletInTransactionMock.mockResolvedValue({ id: 'wallet-1' });
    createWalletIntentMock.mockResolvedValue({ id: 'intent-1', payment_method: 'wallet', status: 'processing' });
    debitWalletInTransactionMock.mockRejectedValue(
      Object.assign(new Error('Insufficient wallet balance.'), { statusCode: 400, isOperational: true }),
    );

    const response = await request(app())
      .post('/api/v1/payments/intent')
      .send({ bookingId: '11111111-1111-4111-8111-111111111111', paymentMethod: 'wallet' });

    expect(response.status).toBe(400);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(getWalletInTransactionMock).toHaveBeenCalledWith(client, 'customer-1', 'customer');
    expect(createWalletIntentMock).toHaveBeenCalledWith(client, '11111111-1111-4111-8111-111111111111', 50000);
    expect(debitWalletInTransactionMock.mock.calls[0]?.[0]).toBe(client);
    expect(clientQueryMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(holdEscrowMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
