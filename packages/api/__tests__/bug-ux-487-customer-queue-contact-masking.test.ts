jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { formatCustomer } from '../src/services/admin.service';

it('Bug UX-487 — the customer queue masks contact for ordinary admins while preserving super-admin access', () => {
  const row = {
    id: 'customer-1', phone: '+639171234567', email: 'ana@example.com', first_name: 'Ana', last_name: 'Reyes',
    role: 'customer', is_active: true, is_flagged_fraud: false,
    created_at: new Date('2026-08-30T01:00:00.000Z'), updated_at: new Date('2026-08-30T01:00:00.000Z'),
    total_bookings: '4', total_spent: '125000', active_bookings: '1', total_disputes: '2',
    open_disputes: '1', open_support_tickets: '1',
  };

  expect(formatCustomer(row, 'admin')).toMatchObject({
    phone: '+63 9XX XXX 4567', email: 'a•••@example.com', contactMasked: true,
  });
  expect(formatCustomer(row, 'super_admin')).toMatchObject({
    phone: '+639171234567', email: 'ana@example.com', contactMasked: false,
  });
});
