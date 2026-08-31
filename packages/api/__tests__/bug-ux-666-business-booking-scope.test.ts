const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { formatBookingAdmin, listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-666 — business booking scope constrains queue totals and projects contract plus invoice linkage', async () => {
  const businessId = '11111111-1111-4111-8111-111111111111';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ total_bookings: '1', active_bookings: '1', unassigned_active: '0', open_support_bookings: '1', disputed_bookings: '0', past_scheduled_bookings: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1', category_id: 'category-1',
      booking_type: 'fixed_price', business_account_id: businessId, business_account_name: 'Cebu Build Co',
      contract_id: 'contract-1', contract_type: 'recurring', invoice_id: 'invoice-1', invoice_number: 'INV-202608-ABC123', invoice_status: 'sent',
      status: 'in_progress', escrow_status: 'held', total_amount: '125000', city: 'Cebu City',
      scheduled_at: new Date('2026-08-30T01:00:00.000Z'), created_at: new Date('2026-08-29T01:00:00.000Z'),
      customer_name: 'Ana Reyes', provider_name: 'Cebu Clean', category_name: 'Post-construction cleanup',
      latitude: null, longitude: null, open_support_tickets: '1', unassigned_support_tickets: '0', urgent_support_tickets: '0',
      support_owner_names: 'Jo Santos', open_disputes: '0', past_scheduled: false,
    }], rowCount: 1 });

  const result = await listBookingsAdmin({ businessAccountId: businessId, page: 1, pageSize: 20 });
  const summaryCall = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('total_bookings'))!;
  const dataSql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT b.id'))?.[0]);

  expect(summaryCall[1]).toEqual([businessId]);
  expect(String(summaryCall[0])).toContain('WHERE b.business_account_id = $1');
  expect(dataSql).toContain('business_invoice_items');
  expect(formatBookingAdmin(result.bookings[0]!)).toMatchObject({
    businessAccountId: businessId,
    businessAccountName: 'Cebu Build Co',
    contractId: 'contract-1',
    invoiceNumber: 'INV-202608-ABC123',
  });
});
