const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateMilestone } from '../src/services/project.service';

it('Bug UX-145 — a completed project milestone cannot be reopened through the API', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'milestone-1',
        project_id: 'project-1',
        title: 'Finished stage',
        description: '',
        sort_order: 0,
        status: 'completed',
        amount: null,
        target_date: null,
        completed_at: new Date('2026-08-23T00:00:00.000Z'),
        created_at: new Date('2026-08-22T00:00:00.000Z'),
        updated_at: new Date('2026-08-23T00:00:00.000Z'),
        p_customer: 'customer-1',
        p_provider: null,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'project-1',
        customer_id: 'customer-1',
        provider_id: null,
        category_id: null,
        title: 'Kitchen plan',
        description: '',
        address: null,
        city: 'Cebu City',
        status: 'planning',
        estimated_total: null,
        created_at: new Date('2026-08-22T00:00:00.000Z'),
        updated_at: new Date('2026-08-23T00:00:00.000Z'),
      }],
      rowCount: 1,
    });

  await expect(updateMilestone(
    'milestone-1',
    { userId: 'customer-1', role: 'customer' },
    { status: 'in_progress' },
  )).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringMatching(/cannot be moved backward/i),
  });
  expect(dbQueryMock.mock.calls.some(([sql]) => String(sql).includes('UPDATE project_milestones'))).toBe(false);
});
