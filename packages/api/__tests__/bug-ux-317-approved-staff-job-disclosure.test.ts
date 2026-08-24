const dbQueryMock = jest.fn(async () => ({
  rows: [{
    id: 'booking-1',
    status: 'in_progress',
    scheduled_at: new Date('2026-08-25T01:00:00.000Z'),
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    category_name: 'Cleaning',
    subcategory_name: 'Turnover Cleaning',
    customer_name: 'Ana Customer',
    provider_business_name: 'Cebu Care Team',
  }],
  rowCount: 1,
}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getAssignedJobsForUser } from '../src/services/provider-staff.service';

it('Bug UX-317 — assigned-job disclosure requires an approved staff membership and identifies the provider business', async () => {
  const jobs = await getAssignedJobsForUser('staff-user-1');

  const [sql, params] = dbQueryMock.mock.calls[0] as unknown as [string, unknown[]];
  expect(sql).toContain("ps.status = 'approved'");
  expect(sql).toContain('p.business_name AS provider_business_name');
  expect(params).toEqual(['staff-user-1']);
  expect(jobs).toEqual([expect.objectContaining({
    id: 'booking-1',
    serviceName: 'Turnover Cleaning',
    providerBusinessName: 'Cebu Care Team',
  })]);
});
