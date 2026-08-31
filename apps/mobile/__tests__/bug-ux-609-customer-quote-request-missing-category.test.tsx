import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JobRequestScreen from '../app/customer/booking/job-request';
import { useBookingStore } from '../src/stores/booking.store';

jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [],
    uploadAll: jest.fn().mockResolvedValue([]),
    removeImage: jest.fn(),
    showPickerOptions: jest.fn(),
    isUploading: false,
  }),
}));

describe('Bug UX-609 — customer quote request requires catalog context', () => {
  it('does not expose a provider request form with an unknown category', () => {
    useBookingStore.getState().reset();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <JobRequestScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Choose a service category first')).toBeTruthy();
    expect(screen.getByText('Browse services')).toBeTruthy();
    expect(screen.queryByText('Describe the Job *')).toBeNull();
  });
});
