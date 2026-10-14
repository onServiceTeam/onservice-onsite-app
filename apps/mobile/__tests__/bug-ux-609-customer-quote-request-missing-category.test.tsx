import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JobRequestScreen from '../app/customer/booking/job-request';
import { useBookingStore } from '../src/stores/booking.store';

// D38 Milestone 2: the form no longer uses useImagePicker; that mock was removed.

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
    // D38 renamed the form's text box to "Describe the job" and its button to
    // "Send request"; neither may render next to the empty state.
    expect(screen.queryByLabelText('Describe the job')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull();
  });
});
