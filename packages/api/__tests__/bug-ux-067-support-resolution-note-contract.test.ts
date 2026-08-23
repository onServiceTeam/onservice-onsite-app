const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateTicketStatus } from '../src/services/support-ticket.service';

it('Bug UX-067 — service rejects blank or token resolution notes for terminal support states', async () => {
  await expect(updateTicketStatus('ticket-1', 'resolved', ' resolved ')).rejects.toMatchObject({
    statusCode: 400,
  });
  await expect(updateTicketStatus('ticket-1', 'closed', '          ')).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(queryMock).not.toHaveBeenCalled();
});
