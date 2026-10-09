const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listTickets } from '../src/services/support-ticket.service';

it('Bug UX-895 — the admin support queue filters by canonical project context and returns its project title', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222';
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'ticket-895', project_id: projectId, project_title: 'Kitchen renovation' }] });

  const result = await listTickets({ page: 1, limit: 20, projectId });

  expect(result).toEqual({
    total: 1,
    tickets: [{ id: 'ticket-895', project_id: projectId, project_title: 'Kitchen renovation' }],
  });
  expect(queryMock).toHaveBeenNthCalledWith(
    1,
    expect.stringMatching(/LEFT JOIN projects project_context ON project_context\.id = st\.project_id[\s\S]*WHERE st\.project_id = \$1/),
    [projectId],
  );
  expect(queryMock).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(/project_context\.title AS project_title[\s\S]*WHERE st\.project_id = \$1/),
    [projectId, 20, 0],
  );
});
