const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateTicketStatus } from '../src/services/support-ticket.service';

it('Bug UX-009 — persists resolution notes when a support case is closed', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [
      {
        id: 'ticket-1',
        status: 'closed',
        resolution_notes: 'Customer confirmed the issue is resolved.',
      },
    ],
  });

  await updateTicketStatus('ticket-1', 'closed', 'Customer confirmed the issue is resolved.');

  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(
    /closed_at = NOW\(\)[\s\S]*resolution_notes = \$3/,
  );
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([
    'ticket-1',
    'closed',
    'Customer confirmed the issue is resolved.',
  ]);
});
