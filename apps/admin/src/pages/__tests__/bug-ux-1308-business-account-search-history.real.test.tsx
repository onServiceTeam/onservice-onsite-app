import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import BusinessAccountsPage from '../BusinessAccountsPage';

// The shared admin test setup stubs URL hooks for simple page mounts. This
// regression needs the real hooks so a router transition can be observed.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return actual;
});

function NavigateBackOnce(): React.ReactElement {
  const navigate = useNavigate();
  useEffect(() => {
    // A concrete history destination keeps the regression deterministic under
    // StrictMode while exercising the same URL change caused by Back/Forward.
    navigate('/business-accounts?search=older-term', { replace: true });
  }, [navigate]);
  return <span aria-hidden="true" />;
}

describe('business-account directory URL state', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({
      data: {
        success: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    } as never);
  });

  it('Bug UX-1308 - browser history keeps the search field aligned with the URL filter', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={['/business-accounts?search=older-term', '/business-accounts?search=newer-term']}
          initialIndex={1}
        >
          <NavigateBackOnce />
          <BusinessAccountsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByDisplayValue('older-term')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search company, city, or contact' })).toHaveValue('older-term');
  });
});
