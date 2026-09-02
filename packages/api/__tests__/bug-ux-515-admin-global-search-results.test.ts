jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Ana Reyes',
    context: 'Customer account',
    status: 'active',
    phone: '+639171234567',
    email: 'ana@example.com',
    related_id: null,
    rank: 2,
    created_at: new Date('2026-08-30T08:00:00.000Z'),
    ...overrides,
  };
}

it('Bug UX-515 — global record search ranks canonical workspaces and never returns raw contact details', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [row()] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [row({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Cebu Home Pro',
      context: 'Pedro Santos',
      status: 'approved',
      rank: 1,
    })] })
    .mockResolvedValueOnce({ rows: [row({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Aircon cleaning',
      context: 'Ana Reyes · Cebu Home Pro · Cebu City, Cebu',
      status: 'paid',
      phone: null,
      email: null,
      rank: 0,
    })] })
    .mockResolvedValueOnce({ rows: [row({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'SUP-1044',
      context: 'Provider is late · Ana Reyes',
      status: 'open',
      phone: null,
      email: null,
    })] })
    .mockResolvedValueOnce({ rows: [row({
      id: '55555555-5555-4555-8555-555555555555',
      title: 'ignored',
      context: 'Booking 33333333 · Ana Reyes · Cebu Home Pro',
      status: 'under_review',
      phone: null,
      email: null,
    })] })
    .mockResolvedValueOnce({ rows: [row({
      id: '66666666-6666-4666-8666-666666666666',
      title: 'ignored',
      context: 'Cebu Home Pro',
      status: 'pending',
      phone: null,
      email: null,
    })] });

  const results = await searchAdminRecords('  0917 123 4567  ');

  expect(results[0]).toMatchObject({
    kind: 'booking',
    title: 'Booking 33333333',
    to: '/bookings/33333333-3333-4333-8333-333333333333',
  });
  expect(results).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'customer', to: '/customers/11111111-1111-4111-8111-111111111111' }),
    expect.objectContaining({ kind: 'provider', to: '/providers/22222222-2222-4222-8222-222222222222' }),
    expect.objectContaining({ kind: 'support', to: '/support-tickets?ticketId=44444444-4444-4444-8444-444444444444' }),
    expect.objectContaining({ kind: 'dispute', to: '/disputes/55555555-5555-4555-8555-555555555555' }),
    expect.objectContaining({ kind: 'payout', to: '/payouts?payoutId=66666666-6666-4666-8666-666666666666' }),
  ]));
  expect(JSON.stringify(results)).toContain('+63 9XX XXX 4567');
  expect(JSON.stringify(results)).toContain('a•••@example.com');
  expect(JSON.stringify(results)).not.toContain('+639171234567');
  expect(JSON.stringify(results)).not.toContain('ana@example.com');
  expect(queryMock).toHaveBeenCalledTimes(7);
  for (const call of queryMock.mock.calls) {
    expect(call[1]).toEqual(['0917 123 4567', '639171234567', 4]);
  }
});
