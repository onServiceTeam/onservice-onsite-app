import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import FeedbackPage from '../FeedbackPage';

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><FeedbackPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Page render: FeedbackPage', () => {
  it('mounts the real page without throwing', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders its operational purpose and status queue controls', () => {
    const { getByRole, getByText } = renderPage();
    expect(getByRole('heading', { name: 'Tester Feedback' })).toBeTruthy();
    expect(getByText(/turn customer, provider, and admin testing into owned work/i)).toBeTruthy();
    expect(getByRole('button', { name: /New/ })).toBeTruthy();
  });

  it('produces a valid root element', () => {
    const { container } = renderPage();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div');
  });
});
