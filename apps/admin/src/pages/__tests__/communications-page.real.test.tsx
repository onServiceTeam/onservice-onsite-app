import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CommunicationsPage from '../CommunicationsPage';

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommunicationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Page render: CommunicationsPage', () => {
  it('mounts without throwing', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders the moderation purpose and queue navigation', () => {
    const { getByRole, getByText } = renderPage();
    expect(getByRole('heading', { name: 'Communications' })).toBeTruthy();
    expect(getByText(/review flagged or reported messages/i)).toBeTruthy();
    expect(getByRole('button', { name: 'Review queue' })).toBeTruthy();
  });

  it('produces a valid root element', () => {
    const { container } = renderPage();
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div');
  });
});
