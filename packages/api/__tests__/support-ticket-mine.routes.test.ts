// Owner-scoping for the in-app support inbox routes (GET /mine, /mine/:id).
// A customer must be able to read their OWN ticket but must get 404 — not the
// row, and not a 403 that confirms existence — for a ticket owned by someone
// else. The customer thread must exclude admin internal notes. And /mine must
// not be captured by the admin /:id route.

import express from 'express';
import request from 'supertest';

let CURRENT_USER: { userId: string; role: string } = { userId: 'u1', role: 'customer' };
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = CURRENT_USER;
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));

const listMyTicketsMock = jest.fn();
const getTicketByIdMock = jest.fn();
const getTicketMessagesMock = jest.fn();
jest.mock('../src/services/support-ticket.service', () => ({
  listMyTickets: (...a: unknown[]) => listMyTicketsMock(...a),
  getTicketById: (...a: unknown[]) => getTicketByIdMock(...a),
  getTicketMessages: (...a: unknown[]) => getTicketMessagesMock(...a),
  // referenced at import time by other routes in the file:
  listTickets: jest.fn(),
  createTicket: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
}));

import supportRouter from '../src/routes/support-ticket.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/support-tickets', supportRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ success: false, error: { message: err.message } });
  });
  return app;
}

beforeEach(() => {
  CURRENT_USER = { userId: 'u1', role: 'customer' };
  listMyTicketsMock.mockReset();
  getTicketByIdMock.mockReset();
  getTicketMessagesMock.mockReset().mockResolvedValue([]);
});

describe('GET /support-tickets/mine', () => {
  it("returns the caller's own tickets", async () => {
    listMyTicketsMock.mockResolvedValueOnce({ tickets: [{ id: 't1', user_id: 'u1' }], total: 1 });
    const res = await request(buildApp()).get('/api/v1/support-tickets/mine');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listMyTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('is not captured by the admin /:id route (calls listMyTickets, not getTicketById)', async () => {
    listMyTicketsMock.mockResolvedValueOnce({ tickets: [], total: 0 });
    const res = await request(buildApp()).get('/api/v1/support-tickets/mine');
    expect(res.status).toBe(200);
    expect(getTicketByIdMock).not.toHaveBeenCalled();
  });
});

describe('GET /support-tickets/mine/:id owner scoping', () => {
  it('returns the ticket + non-internal messages when the caller owns it', async () => {
    getTicketByIdMock.mockResolvedValueOnce({ id: 't1', user_id: 'u1', subject: 'help' });
    getTicketMessagesMock.mockResolvedValueOnce([{ id: 'm1', message: 'hi' }]);
    const res = await request(buildApp()).get('/api/v1/support-tickets/mine/t1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('t1');
    expect(res.body.data.messages).toHaveLength(1);
    expect(getTicketMessagesMock).toHaveBeenCalledWith('t1', false);
  });

  it('returns 404 for a ticket owned by another user and never reads its messages', async () => {
    getTicketByIdMock.mockResolvedValueOnce({ id: 't9', user_id: 'someone-else', subject: 'secret' });
    const res = await request(buildApp()).get('/api/v1/support-tickets/mine/t9');
    expect(res.status).toBe(404);
    expect(getTicketMessagesMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the ticket does not exist', async () => {
    getTicketByIdMock.mockResolvedValueOnce(null);
    const res = await request(buildApp()).get('/api/v1/support-tickets/mine/nope');
    expect(res.status).toBe(404);
  });
});
