import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import ProvidersPage from '../ProvidersPage';

const setSearchParamsMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      new URLSearchParams('serviceAreaId=11111111-1111-4111-8111-111111111111&status=approved'),
      setSearchParamsMock,
    ],
  };
});

it('Bug UX-791 — the provider queue applies and can clear a Service Areas cross-link', async () => {
  vi.mocked(api.get).mockReset().mockResolvedValue({ data: {
    success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } } as never);
  setSearchParamsMock.mockReset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/providers?serviceAreaId=11111111-1111-4111-8111-111111111111&status=approved']}>
        <ProvidersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Service Area provider view')).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/providers', {
    params: {
      page: 1, pageSize: 20, status: 'approved', serviceAreaId: '11111111-1111-4111-8111-111111111111',
    },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear market filter' }));
  expect(setSearchParamsMock).toHaveBeenCalledTimes(1);
  const [nextParams, options] = setSearchParamsMock.mock.calls[0] as [URLSearchParams, { replace: boolean }];
  expect(nextParams.get('serviceAreaId')).toBeNull();
  expect(nextParams.get('status')).toBe('approved');
  expect(options).toEqual({ replace: true });
});
