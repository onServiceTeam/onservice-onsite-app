const queryMock = jest.fn();
const clientQueryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof clientQueryMock }) => unknown) => (
  callback({ query: clientQueryMock })
));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof clientQueryMock }) => unknown]),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTicket } from '../src/services/support-ticket.service';

it('Bug UX-888 — a project-linked support case is accepted only for its customer owner and persists that canonical context', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT role FROM users')) return { rows: [{ role: 'customer' }] };
    if (sql.includes('FROM projects project_context')) {
      return { rows: [{ allowed: params[0] === projectId && params[1] === customerId }] };
    }
    if (sql.includes("nextval('support_ticket_seq')")) return { rows: [{ nextval: '1888' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  clientQueryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO support_tickets')) {
      return { rows: [{ id: 'ticket-888', ticket_number: params[0], project_id: params[7], booking_id: params[6] }] };
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  });

  const ticket = await createTicket({
    userId: customerId,
    projectId,
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Help with kitchen plan',
    description: 'Please help me understand the next planning step.',
  });

  expect(ticket).toMatchObject({ id: 'ticket-888', project_id: projectId, booking_id: null });
  expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('project_context.customer_id = $2'), [projectId, customerId]);
  expect(clientQueryMock).toHaveBeenCalledWith(expect.stringContaining('booking_id, project_id'), [
    'TKT-1888', customerId, 'general_inquiry', 'medium', 'Help with kitchen plan',
    'Please help me understand the next planning step.', null, projectId, null,
  ]);

  queryMock.mockClear();
  transactionMock.mockClear();
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'customer' }] })
    .mockResolvedValueOnce({ rows: [{ allowed: false }] });
  await expect(createTicket({
    userId: customerId,
    projectId: '33333333-3333-4333-8333-333333333333',
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Unrelated project',
    description: 'This project belongs to a different customer.',
  })).rejects.toMatchObject({ statusCode: 404 });
  expect(transactionMock).not.toHaveBeenCalled();
});
