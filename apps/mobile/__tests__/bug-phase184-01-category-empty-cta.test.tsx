// BUG-PHASE184-01 — the category (subcategory list) empty state must offer a
// "Browse Other Categories" CTA. After the A7 migration it's the shared
// EmptyState (actionLabel/onAction). Real render test replacing the prior
// source-regex check.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({ categoryName: 'Cleaning', subcategories: [] }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: 'cleaning' }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(SubcategoryListScreen)),
  );
  return { container };
}

// Human audit 2026-10-13 (HA-DISC): 4 of 10 live categories have no services.
// The empty state now says so plainly and its button reads "Back to services"
// (was "Browse Other Categories"); it still returns the customer to the
// service grid on Home.
describe('BUG-PHASE184-01 — category empty CTA (real render)', () => {
  it('shows the empty state with a Back to services button that returns to the service grid', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No services yet');
    });
    expect(container.textContent).toContain('No services are listed in this category right now.');
    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Back to services'),
    );
    expect(cta).toBeTruthy();
    fireEvent.click(cta!);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/home');
  });
});
