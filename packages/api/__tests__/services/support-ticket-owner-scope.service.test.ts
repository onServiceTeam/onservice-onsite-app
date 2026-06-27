// In-app support inbox — owner-scoped reads (new GET /mine + /mine/:id).
// listMyTickets must scope every query to the calling user and must hide
// admin internal notes from the customer-facing message_count. getTicketMessages
// must drop internal notes when called with includeInternal=false (the
// customer thread view). Pairs with support-ticket-mine.routes.test.ts which
// proves a customer cannot read another user's ticket through the route.

jest.mock('../../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../../src/models/db';
import { listMyTickets, getTicketMessages } from '../../src/services/support-ticket.service';

const mockQuery = db.query as jest.Mock;

beforeEach(() => mockQuery.mockReset());

describe('support inbox — listMyTickets owner scoping', () => {
  it('scopes both the count and data queries to the caller user_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 't1', user_id: 'u1', subject: 'A', status: 'open' },
          { id: 't2', user_id: 'u1', subject: 'B', status: 'resolved' },
        ],
      });

    const result = await listMyTickets({ userId: 'u1', page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.tickets).toHaveLength(2);

    const [countSql, countParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    const [dataSql, dataParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(countSql).toMatch(/st\.user_id = \$1/);
    expect(countParams[0]).toBe('u1');
    expect(dataSql).toMatch(/st\.user_id = \$1/);
    expect(dataParams[0]).toBe('u1');
  });

  it('excludes admin internal notes from the customer message_count', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', status: 'open' }] });
    await listMyTickets({ userId: 'u1', page: 1, limit: 20 });
    const [dataSql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(dataSql).toMatch(/is_internal_note = false/);
  });

  it('applies an optional status filter as a second bound param', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', status: 'open' }] });
    await listMyTickets({ userId: 'u1', page: 1, limit: 20, status: 'open' });
    const [dataSql, dataParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(dataSql).toMatch(/st\.status = \$2/);
    expect(dataParams).toContain('open');
  });
});

describe('support inbox — getTicketMessages hides internal notes', () => {
  it('adds the is_internal_note = false filter when includeInternal is false', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getTicketMessages('t1', false);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/is_internal_note = false/);
  });

  it('does NOT filter internal notes when includeInternal is true (admin view)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getTicketMessages('t1', true);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/is_internal_note = false/);
  });
});
