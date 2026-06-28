// BUG-PHASE184-01 — the category (subcategory list) empty state must offer a
// "Browse Other Categories" CTA. After the A7 migration it's the shared
// EmptyState (actionLabel/onAction). Real render test replacing the prior
// source-regex check.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({ categoryName: 'Cleaning', subcategories: [] }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(SubcategoryListScreen)),
  );
  return { container };
}

describe('BUG-PHASE184-01 — category empty CTA (real render)', () => {
  it('shows the empty state with a Browse Other Categories button when there are no services', async () => {
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No services yet');
    });
    const cta = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Browse Other Categories'),
    );
    expect(cta).toBeTruthy();
  });
});
