const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { markDsrComplete } from '../src/services/compliance-admin.service';

it('Bug UX-818 — a received DSR cannot be completed before its review has started', async () => {
  transactionMock.mockImplementation(async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }));
  queryMock.mockResolvedValueOnce({
    rows: [{
      id: '00000000-0000-0000-0000-000000000001',
      user_id: '00000000-0000-0000-0000-000000000002',
      status: 'received',
      admin_notes: null,
      completed_at: null,
    }],
  });

  await expect(markDsrComplete({
    dsrId: '00000000-0000-0000-0000-000000000001',
    adminUserId: '00000000-0000-0000-0000-000000000003',
  })).rejects.toMatchObject({
    statusCode: 409,
    message: 'Start review before completing a received request.',
  });
  expect(queryMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[0][0]).toMatch(/FOR UPDATE/);
});
