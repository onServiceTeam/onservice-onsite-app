const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => (
  callback({ query: queryMock })
));
const createPushNotificationMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof queryMock }) => unknown]),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
}));

import { addMessage } from '../src/services/support-ticket.service';

it('Bug OPS-305 — a public admin support reply creates a privacy-safe notification for the case owner', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{
        status: 'in_progress', assigned_agent_id: 'admin-305', user_id: 'customer-305',
        ticket_number: 'TKT-1305', booking_id: 'booking-305',
      }],
    })
    .mockResolvedValueOnce({ rows: [{ id: 'message-305', message: 'Private case details are in the app.' }] })
    .mockResolvedValueOnce({ rows: [] });
  createPushNotificationMock.mockResolvedValue({ id: 'notification-305' });

  const message = await addMessage({
    ticketId: 'ticket-305',
    senderId: 'admin-305',
    senderRole: 'admin',
    message: 'Private case details are in the app.',
  });

  expect(message.id).toBe('message-305');
  expect(createPushNotificationMock).toHaveBeenCalledWith({
    userId: 'customer-305',
    type: 'support_update',
    title: 'Support update: TKT-1305',
    body: 'A support agent replied to your request. Open the case to read the update.',
    data: { ticketId: 'ticket-305', ticketNumber: 'TKT-1305', bookingId: 'booking-305' },
  });
  expect(JSON.stringify(createPushNotificationMock.mock.calls[0])).not.toContain('Private case details');
});
