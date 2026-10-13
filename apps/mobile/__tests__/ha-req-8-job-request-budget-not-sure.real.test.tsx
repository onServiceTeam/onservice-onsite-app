// HA-REQ-8 (customer human audit 2026-10-13, D38): a customer who has no idea
// of the price ticks "Not sure, let the pro quote". That clears and locks the
// budget inputs, and the request is sent with no budget at all.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Aircon Services', categorySlug: 'aircon',
  subcategoryId: 'subcategory-1', subcategoryName: 'Aircon repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockCreateJobRequest = jest.fn().mockResolvedValue({ id: 'booking-1' });
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({ localUris: [], uploadAll: jest.fn().mockResolvedValue([]), removeImage: jest.fn(), showPickerOptions: jest.fn(), isUploading: false }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: jest.fn().mockResolvedValue([]),
}));

import JobRequestScreen from '../app/customer/booking/job-request';

it('HA-REQ-8: ticking "Not sure, let the pro quote" clears and disables the budget inputs and sends no budget', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);

  const min = screen.getByLabelText('Minimum budget in pesos') as HTMLInputElement;
  const max = screen.getByLabelText('Maximum budget in pesos') as HTMLInputElement;
  fireEvent.change(min, { target: { value: '1500' } });
  fireEvent.change(max, { target: { value: '2500' } });
  expect(min.value).toBe('1500');
  expect(min.readOnly).toBe(false);

  const notSure = screen.getByRole('checkbox', { name: 'Not sure, let the pro quote' });
  fireEvent.click(notSure);

  expect(notSure.getAttribute('aria-checked')).toBe('true');
  expect(min.value).toBe('');
  expect(max.value).toBe('');
  expect(min.readOnly).toBe(true);
  expect(max.readOnly).toBe(true);
  expect(min.getAttribute('aria-disabled')).toBe('true');
  expect(max.getAttribute('aria-disabled')).toBe('true');

  fireEvent.change(screen.getByLabelText('Describe the job'), {
    target: { value: 'Bedroom aircon is not cooling at all.' },
  });
  const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);

  await waitFor(() => expect(mockCreateJobRequest).toHaveBeenCalledTimes(1));
  const payload = mockCreateJobRequest.mock.calls[0][0] as Record<string, unknown>;
  expect(payload.budgetMin).toBeUndefined();
  expect(payload.budgetMax).toBeUndefined();
  expect(payload).toMatchObject({
    categoryId: 'category-1', subcategoryId: 'subcategory-1',
    description: 'Bedroom aircon is not cooling at all.', urgency: 'within_3_days',
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
});
