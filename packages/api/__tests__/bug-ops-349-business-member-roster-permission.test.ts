const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getMembers } from '../src/services/business.service';

it('Bug OPS-349 — a current company member can see the team roster without gaining financial permission', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'member-row-1',
        business_account_id: '00000000-0000-4000-8000-000000000349',
        user_id: '00000000-0000-4000-8000-000000000001',
        role: 'member',
        can_book: true,
        can_approve: false,
        can_view_invoices: false,
        invited_by: null,
        created_at: new Date('2026-09-02T00:00:00.000Z'),
        first_name: 'Team',
        last_name: 'Member',
        email: 'team@example.test',
      }],
      rowCount: 1,
    });

  const result = await getMembers(
    '00000000-0000-4000-8000-000000000349',
    '00000000-0000-4000-8000-000000000001',
  );

  expect(result).toHaveLength(1);
  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(String(queryMock.mock.calls[0]![0])).not.toContain('can_view_invoices');
  expect(String(queryMock.mock.calls[1]![0])).toContain('JOIN users');
});
