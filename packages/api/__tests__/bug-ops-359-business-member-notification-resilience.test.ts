const queryMock = jest.fn();
const mockCreatePushNotification = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => mockCreatePushNotification(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: (...args: unknown[]) => mockLoggerWarn(...args), error: jest.fn(), debug: jest.fn() },
}));

import { addMember } from '../src/services/business.service';

it('Bug OPS-359 — a push outage after member persistence does not falsely fail the completed invitation', async () => {
  const member = {
    id: '35935935-9359-4359-8359-359359359359',
    business_account_id: '35935935-9359-4359-8359-359359359360',
    user_id: '35935935-9359-4359-8359-359359359361',
    role: 'member',
  };
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [member], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ company_name: 'Acme Cebu' }], rowCount: 1 });
  mockCreatePushNotification.mockRejectedValueOnce(new Error('push provider unavailable'));

  await expect(addMember(
    member.business_account_id,
    '35935935-9359-4359-8359-359359359362',
    member.user_id,
    'member',
    {},
  )).resolves.toEqual(member);

  expect(queryMock).toHaveBeenCalledTimes(4);
  expect(mockLoggerWarn).toHaveBeenCalledWith(
    'Business member notification failed after membership commit',
    expect.objectContaining({ businessId: member.business_account_id, targetUserId: member.user_id }),
  );
});
