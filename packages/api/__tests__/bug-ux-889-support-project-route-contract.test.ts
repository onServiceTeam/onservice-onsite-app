import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));

const createTicketMock = jest.fn();
jest.mock('../src/services/support-ticket.service', () => ({
  createTicket: (...args: unknown[]) => createTicketMock(...args),
  listTickets: jest.fn(),
  listAssignableAgents: jest.fn(),
  getSupportQueueSummary: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketById: jest.fn(),
  getTicketMessages: jest.fn(),
  getTicketStatusHistory: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  updateTicketPriority: jest.fn(),
  assignTicket: jest.fn(),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-889 — the support route forwards one project context and rejects ambiguous booking-plus-project payloads', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const bookingId = '33333333-3333-4333-8333-333333333333';
  createTicketMock.mockResolvedValue({ id: 'ticket-889', project_id: projectId });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);

  const accepted = await request(app).post('/support-tickets/admin').send({
    userId: customerId,
    projectId,
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Planning support',
    description: 'Customer needs help with a planning project.',
  });
  expect(accepted.status).toBe(201);
  expect(createTicketMock).toHaveBeenCalledWith(expect.objectContaining({ userId: customerId, projectId }));

  const rejected = await request(app).post('/support-tickets/admin').send({
    userId: customerId,
    bookingId,
    projectId,
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Ambiguous support context',
    description: 'This request incorrectly identifies two work records.',
  });
  expect(rejected.status).toBe(400);
  expect(rejected.body.error.details).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'projectId', message: expect.stringMatching(/not both/i) }),
  ]));
  expect(createTicketMock).toHaveBeenCalledTimes(1);
});
