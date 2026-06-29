// D27 Phase 7 — provider CRM clients aggregation.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));

import { getProviderClients } from '../src/services/provider-crm.service';

const PROVIDER_ID = 'prov-1';

beforeEach(() => dbQueryMock.mockReset());

describe('getProviderClients', () => {
  it('aggregates the provider bookings into one row per customer', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { customer_id: 'c1', first_name: 'Maria', last_name: 'Santos', job_count: '3', completed_count: '2', last_job_at: new Date('2026-06-20T00:00:00Z'), total_job_value: '450000' },
        { customer_id: 'c2', first_name: 'Jose', last_name: 'Cruz', job_count: '1', completed_count: '0', last_job_at: new Date('2026-05-01T00:00:00Z'), total_job_value: '0' },
      ],
      rowCount: 2,
    });

    const out = await getProviderClients(PROVIDER_ID);

    // Scoped to this provider and grouped by customer.
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE b\.provider_id = \$1/);
    expect(sql).toMatch(/GROUP BY b\.customer_id/);
    expect(dbQueryMock.mock.calls[0][1][0]).toBe(PROVIDER_ID);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      customerId: 'c1', customerName: 'Maria Santos', jobCount: 3, completedCount: 2, totalJobValue: 450000,
    });
    expect(out[0].lastJobAt).toBe('2026-06-20T00:00:00.000Z');
    expect(out[1]).toMatchObject({ customerName: 'Jose Cruz', jobCount: 1, completedCount: 0, totalJobValue: 0 });
  });

  it('returns an empty list when the provider has no bookings', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await getProviderClients(PROVIDER_ID)).toEqual([]);
  });
});
