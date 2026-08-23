import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAddAvailabilityOverride = jest.fn().mockResolvedValue({ id: 'override-1' });
const mockShowToast = jest.fn();

jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]),
  addAvailabilityOverride: (...args: unknown[]) => mockAddAvailabilityOverride(...args),
  removeAvailabilityOverride: jest.fn(),
  getAvailabilityStatus: jest.fn().mockResolvedValue(true),
  toggleAvailability: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import AvailabilitySettingsScreen from '../app/provider/availability';

it('Bug UX-085 — availability custom hours explain and validate HH:MM before submitting', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AvailabilitySettingsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.container.textContent).toContain('No Date Overrides'));

  const add = Array.from(view.container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('+ Add'),
  );
  expect(add).toBeTruthy();
  fireEvent.click(add!);
  fireEvent.change(view.getByLabelText('Override date in YYYY-MM-DD format'), {
    target: { value: '2099-08-31' },
  });

  const custom = Array.from(view.container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('Available Hours for This Date'),
  );
  expect(custom).toBeTruthy();
  fireEvent.click(custom!);
  fireEvent.change(view.getByLabelText('Override start time in HH:MM'), { target: { value: '8:00' } });
  fireEvent.change(view.getByLabelText('Override end time in HH:MM'), { target: { value: '17:00' } });

  const save = Array.from(view.container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').trim() === 'Save',
  );
  expect(save).toBeTruthy();
  fireEvent.click(save!);
  expect(mockAddAvailabilityOverride).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledWith(
    'Enter a valid start time in HH:MM, such as 08:00 for 8:00 AM.',
    'warning',
  );

  fireEvent.change(view.getByLabelText('Override start time in HH:MM'), { target: { value: '08:00' } });
  fireEvent.click(save!);
  await waitFor(() => expect(mockAddAvailabilityOverride).toHaveBeenCalled());
  expect(mockAddAvailabilityOverride.mock.calls[0]?.[0]).toEqual({
    overrideDate: '2099-08-31',
    isAvailable: true,
    startTime: '08:00',
    endTime: '17:00',
    reason: undefined,
  });
});
