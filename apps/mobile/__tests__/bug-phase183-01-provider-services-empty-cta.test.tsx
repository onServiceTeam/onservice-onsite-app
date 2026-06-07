// BUG-PHASE183-01 — the provider "My Services" empty state must offer an
// embedded "Add Your First Service" CTA. After the A7 migration it's the
// shared EmptyState (actionLabel/onAction). Real render test replacing the
// prior source-regex check.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getMyServices: jest.fn().mockResolvedValue([]),
  addService: jest.fn(),
  removeService: jest.fn(),
}));

import ManageServicesScreen from '../app/provider/services';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(ManageServicesScreen)),
  );
  return { container };
}

describe('BUG-PHASE183-01 — provider services empty CTA (real render)', () => {
  it('shows the empty state with an Add Your First Service button when there are no services', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No services added yet');
    });
    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add Your First Service'),
    );
    expect(cta).toBeTruthy();
  });
});
