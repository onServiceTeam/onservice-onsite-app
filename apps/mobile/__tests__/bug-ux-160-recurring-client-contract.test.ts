const mockPost = jest.fn();

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { createRecurringBooking } from '../src/services/recurring.service';

it('BUG-UX-160 — recurring client sends the strict server contract without a client-trusted price', async () => {
  mockPost.mockResolvedValueOnce({ data: { data: { id: 'recurring-1' } } });

  await createRecurringBooking({
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    originalBookingId: 'booking-1',
    frequency: 'weekly',
    preferredDay: 2,
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  });

  expect(mockPost).toHaveBeenCalledWith('/api/v1/recurring', {
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    originalBookingId: 'booking-1',
    frequency: 'weekly',
    preferredDay: 2,
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  });
  expect(mockPost.mock.calls[0]![1]).not.toHaveProperty('servicePrice');
});
