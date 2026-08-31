const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { formatInvoiceItem, getInvoiceDetailAdmin } from '../src/services/invoice.service';

it('Bug UX-670 — admin invoice detail resolves each line item to its booking, customer, provider, and service', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'invoice-1', invoice_number: 'INV-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'item-1', invoice_id: 'invoice-1', booking_id: 'booking-1', contract_id: 'contract-1',
      description: 'Cleanup', service_date: '2026-08-10', quantity: 1, unit_price: 100000,
      discount_amount: 5000, amount: 95000, created_at: new Date('2026-08-10T00:00:00.000Z'),
      booking_status: 'confirmed', customer_id: 'customer-1', customer_name: 'Ana Reyes',
      provider_id: 'provider-1', provider_name: 'Cebu Clean', service_name: 'Post-construction cleanup',
    }], rowCount: 1 });

  const detail = await getInvoiceDetailAdmin('invoice-1');
  const itemSql = String(dbQueryMock.mock.calls[1]?.[0]);

  expect(itemSql).toContain('LEFT JOIN bookings b');
  expect(itemSql).toContain('LEFT JOIN providers provider');
  expect(formatInvoiceItem(detail.items[0]!)).toMatchObject({
    bookingId: 'booking-1', customerId: 'customer-1', providerId: 'provider-1', serviceName: 'Post-construction cleanup',
  });
});
