jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: jest.fn() }));

import { formatRecurringInstance } from '../src/services/recurring.service';

it('BUG-UX-166 — recurring history reports a linked completed booking as completed', () => {
  const formatted = formatRecurringInstance({
    id: 'instance-1',
    recurring_booking_id: 'recurring-1',
    booking_id: 'booking-1',
    scheduled_date: '2026-08-20',
    status: 'created',
    booking_status: 'paid_out',
    substitute_provider_id: null,
    failure_reason: null,
    created_at: new Date('2026-08-01T00:00:00Z'),
  });

  expect(formatted.status).toBe('completed');
  expect(formatted.bookingStatus).toBe('paid_out');
});
