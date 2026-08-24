const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({
  savePrivateArtifact: jest.fn(),
  getPrivateArtifactStream: jest.fn(),
  deletePrivateArtifact: jest.fn(),
}));

import { gatherUserData } from '../src/services/data-management.service';

it('BUG-UX-178 — a provider export includes participant jobs, received messages, and provider records', async () => {
  queryMock.mockImplementation((sql: unknown) => {
    const text = String(sql);
    if (text.includes('FROM providers p WHERE')) return Promise.resolve({ rows: [{ id: 'provider-1', business_name: 'Ana Services' }] });
    if (text.includes('FROM bookings')) return Promise.resolve({ rows: [{ id: 'job-1', provider_id: 'provider-1' }] });
    if (text.includes('FROM messages m')) return Promise.resolve({ rows: [{ id: 'message-1', sender_id: 'customer-1', content: 'Please use the side gate.' }] });
    if (text.includes('FROM payouts p')) return Promise.resolve({ rows: [{ id: 'payout-1', provider_id: 'provider-1' }] });
    return Promise.resolve({ rows: [] });
  });

  const archive = await gatherUserData('provider-user-1');

  expect(archive.providerProfile).toEqual(expect.objectContaining({ id: 'provider-1' }));
  expect(archive.bookings).toEqual([expect.objectContaining({ id: 'job-1' })]);
  expect(archive.messages).toEqual([expect.objectContaining({ sender_id: 'customer-1' })]);
  expect(archive.payouts).toEqual([expect.objectContaining({ id: 'payout-1' })]);
  const bookingSql = String(queryMock.mock.calls.find((call) => String(call[0]).includes('FROM bookings'))?.[0]);
  const messageSql = String(queryMock.mock.calls.find((call) => String(call[0]).includes('FROM messages m'))?.[0]);
  expect(bookingSql).toContain('OR provider_id = (SELECT id FROM providers WHERE user_id = $1)');
  expect(messageSql).toContain('c.customer_id = $1 OR c.provider_id = $1');
});
