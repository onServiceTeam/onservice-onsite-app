const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSupportQueueSummary } from '../src/services/support-ticket.service';

it('Bug OPS-463 - whole-queue summary reports active cases whose latest public message needs an agent reply', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{
    open_count: '7',
    escalated_count: '2',
    urgent_count: '3',
    unassigned_count: '4',
    awaiting_reply_count: '5',
  }] });

  await expect(getSupportQueueSummary()).resolves.toEqual({
    open: 7,
    escalated: 2,
    urgent: 3,
    unassigned: 4,
    awaitingReply: 5,
  });
  const [sql] = queryMock.mock.calls[0] as [string];
  expect(sql).toMatch(/awaiting_reply_count/);
  expect(sql).toMatch(/latest_public\.is_internal_note = FALSE/);
  expect(sql).toMatch(/status NOT IN \('resolved', 'closed'\)/);
});
